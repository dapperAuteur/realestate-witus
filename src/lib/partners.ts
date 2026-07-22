import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { pgErrorCode } from "@/lib/booking/holds";
import { db } from "@/db";
import { hotelSettings, partnerEditTokens, partners, tenants } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { err, ok, type Result } from "@/lib/result";

// Concierge partner lifecycle (workstream 9): partners APPLY on the public
// site, the owner vets/approves/suspends, approved partners keep their own
// profile current via an expiring magic link. The hotel connects, never
// brokers — guests contact partners directly.

export const PARTNER_CATEGORIES = [
  "driver",
  "tour_guide",
  "nightlife",
  "food",
  "wellness",
  "shopping",
  "emergency",
  "other",
] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

const EDIT_TOKEN_DAYS = 30;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface PartnerApplication {
  name: string;
  category: PartnerCategory;
  blurb: string;
  phone?: string;
  whatsappE164?: string;
  email?: string;
  priceNote?: string;
  coverageNote?: string;
  /** The public-listing consent checkbox — required, timestamped. */
  consent: boolean;
}

export async function submitPartnerApplication(
  tenantId: string,
  input: PartnerApplication,
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return err("INVALID_NAME", "Tell us your name or business name.");
  if (!PARTNER_CATEGORIES.includes(input.category)) {
    return err("INVALID_CATEGORY", "Pick what kind of service you offer.");
  }
  const whatsapp = input.whatsappE164?.trim();
  if (whatsapp && !/^\+[1-9]\d{7,14}$/.test(whatsapp)) {
    return err(
      "INVALID_WHATSAPP",
      "WhatsApp number needs international format, like +233201234567.",
    );
  }
  if (!whatsapp && !input.phone?.trim() && !input.email?.trim()) {
    return err("NO_CONTACT", "Give at least one way to reach you.");
  }
  if (!input.consent) {
    return err("NO_CONSENT", "Tick the box to agree to being listed publicly.");
  }

  // Slug uniqueness per tenant: suffix on collision, a few attempts.
  const base = slugify(name) || "partner";
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      const [row] = await db()
        .insert(partners)
        .values({
          tenantId,
          slug,
          name,
          category: input.category,
          blurb: input.blurb.trim() || null,
          phone: input.phone?.trim() || null,
          whatsappE164: whatsapp || null,
          email: input.email?.trim() || null,
          priceNote: input.priceNote?.trim() || null,
          coverageNote: input.coverageNote?.trim() || null,
          status: "applied",
          consentAt: new Date(),
        })
        .returning({ id: partners.id });
      await notifyOwner(tenantId, name, input.category);
      return ok({ id: row.id });
    } catch (error) {
      if (pgErrorCode(error) !== "23505" || attempt === 3) throw error;
    }
  }
  return err("GENERIC", "Could not save the application. Please try again.");
}

/** Best-effort heads-up to the front desk; application saves regardless. */
async function notifyOwner(
  tenantId: string,
  partnerName: string,
  category: string,
): Promise<void> {
  try {
    const [settings] = await db()
      .select({ email: hotelSettings.email, hotelName: hotelSettings.hotelName })
      .from(hotelSettings)
      .where(eq(hotelSettings.tenantId, tenantId))
      .limit(1);
    const [tenant] = await db()
      .select({ emailCfg: tenants.email })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!settings?.email) return;
    await sendEmail({
      to: settings.email,
      from: tenant?.emailCfg.from,
      subject: `New partner application: ${partnerName}`,
      text: `${partnerName} (${category.replace("_", " ")}) applied to join your concierge list.\n\nReview it under Front desk → Partners.`,
    });
  } catch {
    // Notification is best-effort only.
  }
}

export async function listPartnersAdmin(tenantId: string) {
  return db()
    .select()
    .from(partners)
    .where(eq(partners.tenantId, tenantId))
    .orderBy(
      sql`case ${partners.status} when 'applied' then 0 when 'approved' then 1 when 'suspended' then 2 else 3 end`,
      asc(partners.sortOrder),
      asc(partners.name),
    );
}

export type PartnerStatusAction = "approve" | "suspend" | "archive";

export async function setPartnerStatus(
  tenantId: string,
  partnerId: string,
  action: PartnerStatusAction,
): Promise<Result<{ status: string }>> {
  const target =
    action === "approve" ? "approved" : action === "suspend" ? "suspended" : "archived";
  const stamps =
    action === "approve"
      ? { approvedAt: new Date(), suspendedAt: null }
      : action === "suspend"
        ? { suspendedAt: new Date() }
        : {};
  const rows = await db()
    .update(partners)
    .set({ status: target, ...stamps, updatedAt: new Date() })
    .where(and(eq(partners.id, partnerId), eq(partners.tenantId, tenantId)))
    .returning({ id: partners.id });
  if (rows.length === 0) return err("NOT_FOUND", "Partner not found.");

  if (action !== "approve") {
    // Suspension/archive revokes every outstanding self-edit link.
    await db()
      .update(partnerEditTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(partnerEditTokens.partnerId, partnerId), isNull(partnerEditTokens.revokedAt)),
      );
  }
  return ok({ status: target });
}

export async function issueEditToken(
  tenantId: string,
  partnerId: string,
  siteBase: string,
  lang: string,
): Promise<Result<{ url: string; emailed: boolean }>> {
  const [partner] = await db()
    .select()
    .from(partners)
    .where(and(eq(partners.id, partnerId), eq(partners.tenantId, tenantId)))
    .limit(1);
  if (!partner) return err("NOT_FOUND", "Partner not found.");
  if (partner.status !== "approved") {
    return err("NOT_APPROVED", "Only approved partners get edit links.");
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + EDIT_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await db().insert(partnerEditTokens).values({ partnerId, token, expiresAt });

  const url = `${siteBase}/${lang}/partner/${token}`;
  let emailed = false;
  if (partner.email) {
    try {
      const [tenant] = await db()
        .select({ email: tenants.email, name: tenants.name, theme: tenants.theme })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      const brand = tenant?.theme.name ?? tenant?.name ?? "the hotel";
      await sendEmail({
        to: partner.email,
        from: tenant?.email.from,
        subject: `Update your listing at ${brand}`,
        text: [
          `Hello ${partner.name},`,
          "",
          `Use this link to update your concierge listing at ${brand}:`,
          url,
          "",
          `The link works for ${EDIT_TOKEN_DAYS} days. If you did not expect it, ignore this email.`,
        ].join("\n"),
      });
      emailed = true;
    } catch {
      // Owner still gets the URL to share by WhatsApp.
    }
  }
  return ok({ url, emailed });
}

export async function getPartnerByToken(tenantId: string, token: string) {
  const [row] = await db()
    .select({ partner: partners, tokenId: partnerEditTokens.id })
    .from(partnerEditTokens)
    .innerJoin(partners, eq(partnerEditTokens.partnerId, partners.id))
    .where(
      and(
        eq(partnerEditTokens.token, token),
        isNull(partnerEditTokens.revokedAt),
        gt(partnerEditTokens.expiresAt, new Date()),
        eq(partners.tenantId, tenantId),
        eq(partners.status, "approved"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface PartnerSelfEdit {
  blurb: string;
  phone?: string;
  whatsappE164?: string;
  priceNote?: string;
  coverageNote?: string;
}

export async function updatePartnerProfile(
  tenantId: string,
  token: string,
  input: PartnerSelfEdit,
): Promise<Result<{ updated: boolean }>> {
  const found = await getPartnerByToken(tenantId, token);
  if (!found) {
    return err("TOKEN_INVALID", "This link has expired. Ask the hotel for a new one.");
  }
  const whatsapp = input.whatsappE164?.trim();
  if (whatsapp && !/^\+[1-9]\d{7,14}$/.test(whatsapp)) {
    return err(
      "INVALID_WHATSAPP",
      "WhatsApp number needs international format, like +233201234567.",
    );
  }
  await db()
    .update(partners)
    .set({
      blurb: input.blurb.trim() || null,
      phone: input.phone?.trim() || null,
      whatsappE164: whatsapp || null,
      priceNote: input.priceNote?.trim() || null,
      coverageNote: input.coverageNote?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(partners.id, found.partner.id));
  await db()
    .update(partnerEditTokens)
    .set({ usedAt: new Date() })
    .where(eq(partnerEditTokens.id, found.tokenId));
  return ok({ updated: true });
}
