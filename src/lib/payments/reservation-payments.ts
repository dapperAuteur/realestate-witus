import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, withTx } from "@/db";
import { payments, reservations } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import type { TenantRecord } from "@/lib/tenant";
import type { WebhookEvent } from "./provider";
import { providerForTenant } from "./tenant-provider";

// Reservation payment lifecycle. Initiation prices from the reservation row
// (server truth, never a client amount); webhook application is idempotent on
// payments.provider_ref so provider retries and replays are no-ops.

export interface InitiateReservationPaymentInput {
  tenant: TenantRecord;
  reservationId: string;
  /** Absolute URL on the tenant's own domain for the post-payment landing. */
  callbackUrl: string;
}

export interface InitiatedPayment {
  checkoutUrl: string;
  paymentId: string;
  reference: string;
  amountMinor: number;
  currency: string;
}

export async function initiateReservationPayment(
  input: InitiateReservationPaymentInput,
): Promise<Result<InitiatedPayment>> {
  const { tenant, reservationId, callbackUrl } = input;

  const [reservation] = await db()
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!reservation) {
    return err("RESERVATION_NOT_FOUND", "Reservation not found.");
  }
  if (reservation.status !== "pending_payment") {
    return err("NOT_PAYABLE", "This reservation is not awaiting payment.");
  }

  const provider = providerForTenant(tenant);
  if (!provider.ok) return provider;

  // Deposit when the mode split one out; otherwise the full amount.
  const isDeposit =
    reservation.depositMinor > 0 &&
    reservation.depositMinor < reservation.totalMinor;
  const amountMinor = isDeposit
    ? reservation.depositMinor
    : reservation.totalMinor;
  const reference = `swu-${randomUUID()}`;

  const [payment] = await db()
    .insert(payments)
    .values({
      tenantId: tenant.id,
      reservationId: reservation.id,
      provider: provider.data.key,
      providerRef: reference,
      kind: isDeposit ? "deposit" : "full",
      amountMinor,
      currency: reservation.currency,
      state: "initiated",
    })
    .returning({ id: payments.id });

  const init = await provider.data.initializePayment({
    amountMinor,
    currency: reservation.currency,
    email: reservation.guestEmail,
    reference,
    callbackUrl,
    metadata: { reservationCode: reservation.code },
  });
  if (!init.ok) return init;

  return ok({
    checkoutUrl: init.data.checkoutUrl,
    paymentId: payment.id,
    reference,
    amountMinor,
    currency: reservation.currency,
  });
}

/**
 * Applies a verified webhook event. Returns applied:false (not an error) for
 * replays and ignorable events — the webhook route 200s either way so the
 * provider stops retrying.
 */
export async function applyPaymentEvent(
  tenantId: string,
  event: WebhookEvent,
): Promise<Result<{ applied: boolean }>> {
  if (event.kind === "ignored") return ok({ applied: false });

  return withTx(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.providerRef, event.providerRef),
          eq(payments.tenantId, tenantId),
        ),
      )
      .for("update")
      .limit(1);
    if (!payment) {
      return err("UNKNOWN_REFERENCE", "No payment matches this reference.");
    }

    if (event.kind === "payment_failed") {
      if (payment.state !== "initiated") return ok({ applied: false });
      await tx
        .update(payments)
        .set({ state: "failed", raw: event.raw, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      return ok({ applied: true });
    }

    // payment_success
    if (payment.state === "success") return ok({ applied: false });
    if (
      event.amountMinor !== payment.amountMinor ||
      event.currency !== payment.currency
    ) {
      // Amount tampering / misconfiguration: never confirm the reservation.
      return err("AMOUNT_MISMATCH", "Paid amount does not match the payment.");
    }

    await tx
      .update(payments)
      .set({
        state: "success",
        channel: event.channel,
        raw: event.raw,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    if (payment.reservationId) {
      const [reservation] = await tx
        .select({
          id: reservations.id,
          totalMinor: reservations.totalMinor,
          status: reservations.status,
        })
        .from(reservations)
        .where(eq(reservations.id, payment.reservationId))
        .limit(1);
      if (reservation) {
        await tx
          .update(reservations)
          .set({
            paymentStatus:
              payment.amountMinor >= reservation.totalMinor
                ? "paid"
                : "deposit_paid",
            status:
              reservation.status === "pending_payment"
                ? "confirmed"
                : reservation.status,
            updatedAt: new Date(),
          })
          .where(eq(reservations.id, reservation.id));
      }
    }

    return ok({ applied: true });
  });
}
