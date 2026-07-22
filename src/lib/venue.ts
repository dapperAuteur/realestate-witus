import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { hotelSettings, tenants, venueInquiries } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { err, ok, type Result } from "@/lib/result";
import { sendToInbox } from "@/lib/witus-inbox";

// Venue hire pipeline (rooftop private events — the Osu hotel's second
// revenue stream). Saved locally, owner emailed, AND forwarded to WitUS
// Inbox with full content: the inbox is BAM's authenticated operator tool,
// not a log (the no-PII rule governs logs).

export const INQUIRY_STATUSES = [
  "new",
  "contacted",
  "quoted",
  "confirmed",
  "declined",
  "archived",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export interface VenueInquiryInput {
  name: string;
  email: string;
  phone?: string;
  eventType?: string;
  preferredDate?: string;
  altDate?: string;
  partySize?: number;
  budgetRange?: string;
  message?: string;
}

export async function submitVenueInquiry(
  tenantId: string,
  input: VenueInquiryInput,
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err("INVALID_GUEST", "Give us your name and a valid email.");
  }
  const partySize =
    input.partySize && Number.isInteger(input.partySize) && input.partySize > 0
      ? Math.min(input.partySize, 500)
      : null;

  const [row] = await db()
    .insert(venueInquiries)
    .values({
      tenantId,
      name,
      email,
      phone: input.phone?.trim() || null,
      eventType: input.eventType?.trim() || null,
      preferredDate: input.preferredDate || null,
      altDate: input.altDate || null,
      partySize,
      budgetRange: input.budgetRange?.trim() || null,
      message: input.message?.trim() || null,
    })
    .returning({ id: venueInquiries.id });

  // Owner heads-up + BAM's inbox, both best-effort — the row is the truth.
  try {
    const [settings] = await db()
      .select({ email: hotelSettings.email })
      .from(hotelSettings)
      .where(eq(hotelSettings.tenantId, tenantId))
      .limit(1);
    const [tenant] = await db()
      .select({ emailCfg: tenants.email, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (settings?.email) {
      await sendEmail({
        to: settings.email,
        from: tenant?.emailCfg.from,
        subject: `Venue inquiry: ${name}${input.eventType ? ` — ${input.eventType}` : ""}`,
        text: [
          `${name} asked about hiring the venue.`,
          input.eventType ? `Type: ${input.eventType}` : null,
          input.preferredDate ? `Date: ${input.preferredDate}${input.altDate ? ` (alt ${input.altDate})` : ""}` : null,
          partySize ? `Party: ${partySize}` : null,
          input.budgetRange ? `Budget: ${input.budgetRange}` : null,
          input.message ? `\n${input.message}` : null,
          `\nReply to: ${email}${input.phone ? ` / ${input.phone}` : ""}`,
          `\nManage it under Front desk → Events.`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }
  } catch {
    /* best-effort */
  }
  await sendToInbox("venue.inquiry.created", {
    inquiryId: row.id,
    tenantId,
    name,
    email,
    phone: input.phone ?? null,
    eventType: input.eventType ?? null,
    preferredDate: input.preferredDate ?? null,
    partySize,
    budgetRange: input.budgetRange ?? null,
    message: input.message ?? null,
  });

  return ok({ id: row.id });
}

export async function listInquiriesAdmin(tenantId: string) {
  return db()
    .select()
    .from(venueInquiries)
    .where(eq(venueInquiries.tenantId, tenantId))
    .orderBy(
      sql`case ${venueInquiries.status} when 'new' then 0 when 'contacted' then 1 when 'quoted' then 2 else 3 end`,
      desc(venueInquiries.createdAt),
    )
    .limit(100);
}

export async function setInquiryStatus(
  tenantId: string,
  inquiryId: string,
  status: InquiryStatus,
): Promise<Result<{ updated: boolean }>> {
  if (!INQUIRY_STATUSES.includes(status)) {
    return err("INVALID_STATUS", "Unknown status.");
  }
  const rows = await db()
    .update(venueInquiries)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(venueInquiries.id, inquiryId), eq(venueInquiries.tenantId, tenantId)),
    )
    .returning({ id: venueInquiries.id });
  if (rows.length === 0) return err("NOT_FOUND", "Inquiry not found.");
  return ok({ updated: true });
}
