import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  emailLog,
  hotelSettings,
  reservations,
  tenantDomains,
  tenants,
} from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { ok, type Result } from "@/lib/result";

// Booking-abandonment recovery (research A4): pending_payment reservations
// 1-48h old get ONE transactional reminder with a link back to their
// confirmation page (which offers Pay now). Transactional, not marketing —
// the guest started this booking, so no opt-in is required; and email_log
// is the idempotency ledger, so a rerun never double-sends.

const TEMPLATE = "payment-recovery";

export async function sendPaymentRecoveryEmails(): Promise<
  Result<{ sent: number; skipped: number }>
> {
  const now = Date.now();
  const rows = await db()
    .select({
      id: reservations.id,
      tenantId: reservations.tenantId,
      code: reservations.code,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      checkIn: reservations.checkIn,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.status, "pending_payment"),
        eq(reservations.paymentStatus, "unpaid"),
        lte(reservations.createdAt, new Date(now - 60 * 60 * 1000)),
        gte(reservations.createdAt, new Date(now - 48 * 60 * 60 * 1000)),
        isNull(
          db()
            .select({ id: emailLog.id })
            .from(emailLog)
            .where(
              and(
                eq(emailLog.reservationId, reservations.id),
                eq(emailLog.template, TEMPLATE),
              ),
            )
            .limit(1),
        ),
      ),
    )
    .limit(50);

  let sent = 0;
  let skipped = 0;
  for (const reservation of rows) {
    const [domain] = await db()
      .select({ host: tenantDomains.host })
      .from(tenantDomains)
      .where(eq(tenantDomains.tenantId, reservation.tenantId))
      .orderBy(sql`${tenantDomains.isPrimary} desc`)
      .limit(1);
    if (!domain) {
      skipped += 1; // No public host yet: nowhere to link the guest.
      continue;
    }
    const [tenant] = await db()
      .select({ emailCfg: tenants.email, name: tenants.name, theme: tenants.theme })
      .from(tenants)
      .where(eq(tenants.id, reservation.tenantId))
      .limit(1);
    const [settings] = await db()
      .select({ phone: hotelSettings.phone })
      .from(hotelSettings)
      .where(eq(hotelSettings.tenantId, reservation.tenantId))
      .limit(1);
    const brand = tenant?.theme.name ?? tenant?.name ?? "the hotel";
    const link = `https://${domain.host}/en/book/done?code=${encodeURIComponent(reservation.code)}`;

    try {
      await sendEmail({
        to: reservation.guestEmail,
        from: tenant?.emailCfg.from,
        replyTo: tenant?.emailCfg.replyTo,
        subject: `Your room at ${brand} is still waiting`,
        text: [
          `Hello ${reservation.guestName},`,
          "",
          `Your reservation ${reservation.code} (check-in ${reservation.checkIn}) at ${brand} is saved but not yet confirmed - the deposit payment did not complete.`,
          "",
          `Finish it here: ${link}`,
          "",
          settings?.phone
            ? `Questions? Call ${settings.phone}.`
            : "Questions? Just reply to this email.",
          "",
          "If you changed your plans, ignore this message and the room frees up by itself.",
        ].join("\n"),
      });
      await db().insert(emailLog).values({
        tenantId: reservation.tenantId,
        to: reservation.guestEmail,
        template: TEMPLATE,
        reservationId: reservation.id,
        status: "sent",
      });
      sent += 1;
    } catch {
      skipped += 1; // Send failed: no log row, so the next run retries.
    }
  }
  return ok({ sent, skipped });
}
