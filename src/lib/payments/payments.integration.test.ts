// Full guest-payment chain against Neon (skipped without a DB URL): booking
// engine creates a real pending_payment reservation, a payment row is
// initiated, then a signed Paystack webhook drives the ACTUAL route handler.
// Asserts confirmation, idempotent replay, and amount-tampering rejection.
// Throwaway tenant, cascade-deleted in afterAll.

import { createHmac, randomUUID } from "node:crypto";
import { tableExists } from "@/lib/db-probe";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as paystackWebhook } from "@/app/api/webhooks/paystack/[tenantSlug]/route";
import { db } from "@/db";
import {
  payments,
  reservations,
  roomTypes,
  roomUnits,
  tenants,
} from "@/db/schema";
import { confirmHold, createHold } from "@/lib/booking/holds";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);
// Booking inserts include migration-0002 columns (drizzle lists every schema
// column), so these suites need the migration; they self-skip until task 07.
const ready = hasDb && (await tableExists("promo_codes"));

const SECRET_ENV = "ITEST_PAYSTACK_SECRET";
const SECRET = "sk_test_integration-secret";

function webhookRequest(slug: string, payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  return paystackWebhook(
    new Request(`http://localhost/api/webhooks/paystack/${slug}`, {
      method: "POST",
      headers: { "x-paystack-signature": signature },
      body,
    }),
    { params: Promise.resolve({ tenantSlug: slug }) },
  );
}

describe.skipIf(!ready)("guest payment chain against Neon (needs migration 0002)", () => {
  const slug = `itest-pay-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let reservationId: string;
  let reference: string;
  let depositMinor: number;

  beforeAll(async () => {
    process.env[SECRET_ENV] = SECRET;
    const [tenant] = await db()
      .insert(tenants)
      .values({
        slug,
        name: "Integration Pay Hotel",
        payment: { provider: "paystack", currency: "GHS", secretRef: SECRET_ENV },
      })
      .returning({ id: tenants.id });
    tenantId = tenant.id;

    const [roomType] = await db()
      .insert(roomTypes)
      .values({ tenantId, slug: "pay-room", name: "Pay Room", baseRateMinor: 50_000 })
      .returning({ id: roomTypes.id });
    await db()
      .insert(roomUnits)
      .values({ tenantId, roomTypeId: roomType.id, unitNumber: "P1" });

    // Booking engine produces the real pending_payment reservation
    // (instant_deposit 30% defaults: 3 nights x 500 GHS -> 450 GHS deposit).
    const hold = await createHold({
      tenantId,
      roomTypeId: roomType.id,
      checkIn: "2031-02-01",
      checkOut: "2031-02-04",
      holdSession: "pay-session",
    });
    if (!hold.ok) throw new Error("hold failed");
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "pay-session",
      guestName: "Pay Tester",
      guestEmail: "pay-tester@example.com",
    });
    if (!confirmed.ok) throw new Error("confirm failed");
    reservationId = confirmed.data.reservationId;
    depositMinor = confirmed.data.depositMinor;
    expect(confirmed.data.status).toBe("pending_payment");

    // Payment row as initiateReservationPayment writes it (its Paystack call
    // is network I/O we do not exercise here).
    reference = `swu-${randomUUID()}`;
    await db().insert(payments).values({
      tenantId,
      reservationId,
      provider: "paystack",
      providerRef: reference,
      kind: "deposit",
      amountMinor: depositMinor,
      currency: "GHS",
      state: "initiated",
    });
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
    delete process.env[SECRET_ENV];
  });

  it("rejects a wrong signature with 401 and applies nothing", async () => {
    const res = await webhookRequest(
      slug,
      { event: "charge.success", data: { reference, amount: depositMinor, currency: "GHS" } },
      "sk_test_wrong-secret",
    );
    expect(res.status).toBe(401);
  });

  it("rejects a tampered amount without confirming the reservation", async () => {
    const res = await webhookRequest(slug, {
      event: "charge.success",
      data: { reference, amount: 1, currency: "GHS" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });

    const [r] = await db()
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, reservationId));
    expect(r.status).toBe("pending_payment");
  });

  it("a valid charge.success confirms the reservation as deposit_paid", async () => {
    const res = await webhookRequest(slug, {
      event: "charge.success",
      data: {
        reference,
        amount: depositMinor,
        currency: "GHS",
        channel: "mobile_money",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { applied: true } });

    const [r] = await db()
      .select({
        status: reservations.status,
        paymentStatus: reservations.paymentStatus,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId));
    expect(r).toEqual({ status: "confirmed", paymentStatus: "deposit_paid" });

    const [p] = await db()
      .select({ state: payments.state, channel: payments.channel })
      .from(payments)
      .where(eq(payments.providerRef, reference));
    expect(p).toEqual({ state: "success", channel: "mobile_money" });
  });

  it("replaying the same webhook is a no-op", async () => {
    const res = await webhookRequest(slug, {
      event: "charge.success",
      data: { reference, amount: depositMinor, currency: "GHS" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { applied: false } });
  });

  it("unknown references report cleanly (still 200, no retry storm)", async () => {
    const res = await webhookRequest(slug, {
      event: "charge.success",
      data: { reference: "swu-never-issued", amount: 100, currency: "GHS" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, code: "UNKNOWN_REFERENCE" });
  });
});
