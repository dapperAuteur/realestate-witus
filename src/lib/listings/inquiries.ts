import "server-only";
import { db } from "@/db";
import { emailLog, listingInquiries } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { err, ok, type Result } from "@/lib/result";
import type { TenantRecord } from "@/lib/tenant";
import { listingPageUrl } from "./embed";
import { inquiryEmail, parseInquiry } from "./inquiry";
import { findListing, loadAgent } from "./queries";

/**
 * Saves a buyer's inquiry and emails the listing's agent (the agency's first
 * owner when no agent is set). The row is the record: if the email fails, the
 * inquiry is still saved for the admin, and the buyer still sees success.
 */
export async function submitInquiry(input: {
  tenant: TenantRecord;
  slug: string;
  raw: Record<string, unknown>;
  /** scheme + host the buyer is on, for the link in the agent's email. */
  origin: string;
  now?: number;
}): Promise<Result<{ saved: boolean }>> {
  const listing = await findListing(input.tenant.id, input.slug);
  if (!listing) return err("LISTING_NOT_FOUND", "This listing is not available.");

  const parsed = parseInquiry(input.raw, input.now ?? Date.now());
  if (!parsed.ok) {
    // Quiet for bots: success, nothing stored, nothing learned.
    return parsed.code === "SPAM" ? ok({ saved: false }) : parsed;
  }
  const inquiry = parsed.data;

  await db().insert(listingInquiries).values({
    tenantId: input.tenant.id,
    listingId: listing.id,
    kind: inquiry.kind,
    source: inquiry.source,
    surface: inquiry.surface,
    name: inquiry.name,
    email: inquiry.email,
    phone: inquiry.phone,
    message: inquiry.message,
    preferredTimes: inquiry.preferredTimes,
  });

  const agent = await loadAgent(input.tenant.id, listing.agentUserId, {
    platformTenant: Boolean(input.tenant.flags.platform),
  }).catch(() => null);
  if (agent) {
    const email = inquiryEmail({
      inquiry,
      listingTitle: listing.title,
      listingUrl: listingPageUrl(input.origin, listing.slug),
    });
    let providerId: string | null = null;
    let status = "sent";
    try {
      ({ id: providerId } = await sendEmail({
        to: agent.email,
        from: input.tenant.email.from,
        replyTo: inquiry.email,
        subject: email.subject,
        text: email.text,
      }));
    } catch (error) {
      status = "failed";
      console.error("[inquiry] agent email failed", { listingId: listing.id, error });
    }
    await db()
      .insert(emailLog)
      .values({ tenantId: input.tenant.id, to: agent.email, template: "listing_inquiry", providerId, status })
      .catch(() => undefined);
  }
  return ok({ saved: true });
}
