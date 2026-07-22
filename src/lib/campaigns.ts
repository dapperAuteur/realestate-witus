import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcementDeliveries,
  announcements,
  emailSuppressions,
} from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";
import { err, ok, type Result } from "@/lib/result";

// Campaigns (plans/09 lane B) on the existing announcements tables.
// CONSENT RULES: recipients are derived from reservations at send time,
// filtered to marketing_opt_in = true and not suppressed; every email
// carries an unsubscribe link. Publishing on-site needs no consent.
// The owner's WhatsApp share link is the zero-consent channel.

export type Audience =
  | "all_subscribers"
  | "current_guests"
  | "upcoming_guests"
  | "past_guests";

export type AnnouncementRow = typeof announcements.$inferSelect;

export async function listAnnouncements(tenantId: string) {
  return db()
    .select()
    .from(announcements)
    .where(eq(announcements.tenantId, tenantId))
    .orderBy(desc(announcements.createdAt))
    .limit(50);
}

export async function createAnnouncement(args: {
  tenantId: string;
  title: string;
  body: string;
  urgency: "normal" | "urgent";
  audience: Audience;
  createdBy?: string;
}): Promise<Result<{ id: string }>> {
  if (!args.title.trim() || !args.body.trim()) {
    return err("INVALID_CONTENT", "Give the announcement a title and a message.");
  }
  const [row] = await db()
    .insert(announcements)
    .values({
      tenantId: args.tenantId,
      title: args.title.trim(),
      body: args.body.trim(),
      urgency: args.urgency,
      audience: args.audience,
      createdBy: args.createdBy,
    })
    .returning({ id: announcements.id });
  return ok({ id: row.id });
}

export async function setAnnouncementPublished(
  tenantId: string,
  id: string,
  publish: boolean,
): Promise<Result<{ published: boolean }>> {
  const rows = await db()
    .update(announcements)
    .set({ publishedAt: publish ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(announcements.id, id), eq(announcements.tenantId, tenantId)))
    .returning({ id: announcements.id });
  if (rows.length === 0) return err("NOT_FOUND", "Announcement not found.");
  return ok({ published: publish });
}

/** Latest on-site announcement for the homepage banner. */
export async function latestPublishedAnnouncement(tenantId: string) {
  const [row] = await db()
    .select()
    .from(announcements)
    .where(
      and(eq(announcements.tenantId, tenantId), isNotNull(announcements.publishedAt)),
    )
    .orderBy(desc(announcements.publishedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Opted-in, unsuppressed emails for a segment, derived from reservations at
 * send time (segments per messaging.ts). Distinct on email.
 */
export async function audienceRecipients(
  tenantId: string,
  audience: Audience,
  today: string,
): Promise<{ email: string; guestName: string }[]> {
  const segment =
    audience === "current_guests"
      ? sql`(r.status = 'checked_in' or (r.status = 'confirmed' and r.check_in <= ${today} and r.check_out > ${today}))`
      : audience === "upcoming_guests"
        ? sql`(r.status in ('confirmed', 'pending_payment') and r.check_in > ${today})`
        : audience === "past_guests"
          ? sql`(r.status = 'checked_out' or (r.check_out <= ${today} and r.status in ('confirmed', 'checked_in')))`
          : sql`r.status not in ('cancelled', 'no_show', 'expired')`;

  const result = await db().execute<{ email: string; guest_name: string }>(sql`
    select distinct on (lower(r.guest_email)) r.guest_email as email, r.guest_name
    from reservations r
    where r.tenant_id = ${tenantId}
      and r.marketing_opt_in = true
      and ${segment}
      and not exists (
        select 1 from email_suppressions s
        where s.tenant_id = ${tenantId} and lower(s.email) = lower(r.guest_email)
      )
    order by lower(r.guest_email), r.created_at desc
  `);
  return result.rows.map((r) => ({ email: r.email, guestName: r.guest_name }));
}

// ── Unsubscribe links (HMAC over tenant+email; no token table needed) ────────

export function unsubscribeSig(tenantId: string, email: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET ?? "")
    .update(`unsub:${tenantId}:${email.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeSig(
  tenantId: string,
  email: string,
  sig: string,
): boolean {
  const expected = Buffer.from(unsubscribeSig(tenantId, email), "utf8");
  const given = Buffer.from(sig, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(
  base: string,
  tenantId: string,
  email: string,
): string {
  const params = new URLSearchParams({
    tenant: tenantId,
    email,
    sig: unsubscribeSig(tenantId, email),
  });
  return `${base}/api/unsubscribe?${params}`;
}

export async function suppressEmail(
  tenantId: string,
  email: string,
): Promise<void> {
  await db()
    .insert(emailSuppressions)
    .values({ tenantId, email: email.toLowerCase() })
    .onConflictDoNothing({
      target: [emailSuppressions.tenantId, emailSuppressions.email],
    });
}

// ── Send ─────────────────────────────────────────────────────────────────────

/**
 * Email fan-out, idempotent per (announcement, email): re-sending after a
 * partial failure only touches still-queued deliveries.
 */
export async function sendAnnouncement(args: {
  tenantId: string;
  announcementId: string;
  today: string;
  from?: string;
  replyTo?: string;
  /** https origin of the tenant site, for the unsubscribe link. */
  siteBase: string;
  brandName: string;
}): Promise<Result<{ queued: number; sent: number }>> {
  const [announcement] = await db()
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, args.announcementId),
        eq(announcements.tenantId, args.tenantId),
      ),
    )
    .limit(1);
  if (!announcement) return err("NOT_FOUND", "Announcement not found.");

  const recipients = await audienceRecipients(
    args.tenantId,
    announcement.audience,
    args.today,
  );
  if (recipients.length > 0) {
    await db()
      .insert(announcementDeliveries)
      .values(
        recipients.map((r) => ({
          announcementId: announcement.id,
          email: r.email.toLowerCase(),
        })),
      )
      .onConflictDoNothing({
        target: [
          announcementDeliveries.announcementId,
          announcementDeliveries.email,
        ],
      });
  }

  const queued = await db()
    .select()
    .from(announcementDeliveries)
    .where(
      and(
        eq(announcementDeliveries.announcementId, announcement.id),
        eq(announcementDeliveries.status, "queued"),
      ),
    );

  let sent = 0;
  for (const delivery of queued) {
    try {
      await sendEmail({
        to: delivery.email,
        from: args.from,
        replyTo: args.replyTo,
        subject: announcement.title,
        text: [
          announcement.body,
          "",
          "—",
          `You agreed to occasional updates from ${args.brandName} when booking.`,
          `Unsubscribe: ${unsubscribeUrl(args.siteBase, args.tenantId, delivery.email)}`,
        ].join("\n"),
      });
      await db()
        .update(announcementDeliveries)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(announcementDeliveries.id, delivery.id));
      sent += 1;
    } catch {
      await db()
        .update(announcementDeliveries)
        .set({ status: "failed" })
        .where(eq(announcementDeliveries.id, delivery.id));
    }
  }

  await db()
    .update(announcements)
    .set({ sentAt: new Date(), updatedAt: new Date() })
    .where(eq(announcements.id, announcement.id));
  return ok({ queued: queued.length, sent });
}

/** The owner forwards this to the guest WhatsApp group — zero consent risk. */
export function whatsAppShareUrl(args: {
  title: string;
  body: string;
  siteUrl: string;
}): string {
  const text = `${args.title}\n\n${args.body}\n\n${args.siteUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
