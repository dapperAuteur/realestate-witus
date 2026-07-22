// Settings round trip against Neon (skips without a DB URL): validation,
// upsert-then-update, and the policy snapshot flowing into a real booking.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { reservations, roomTypes, roomUnits, tenants } from "@/db/schema";
import { confirmHold, createHold } from "@/lib/booking/holds";
import { getHotelSettings, upsertHotelSettings } from "./settings";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

const BASE = {
  hotelName: "Settings Test Hotel",
  address: "",
  phone: "",
  whatsappE164: "",
  whatsappGroupUrl: "",
  email: "",
  checkinTime: "14:00",
  checkoutTime: "11:00",
  timezone: "Africa/Accra",
  bookingMode: "instant_deposit" as const,
  depositPercent: 30,
  holdMinutes: 15,
  cancellationFreeUntilDays: 3,
  cancellationPenaltyPercent: 50,
};

describe.skipIf(!hasDb)("hotel settings against Neon", () => {
  let tenantId: string;
  let roomTypeId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-settings-${randomUUID().slice(0, 8)}`, name: "Settings Test" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
    const [rt] = await db()
      .insert(roomTypes)
      .values({ tenantId, slug: "st-room", name: "ST Room", baseRateMinor: 40_000 })
      .returning({ id: roomTypes.id });
    roomTypeId = rt.id;
    await db().insert(roomUnits).values({ tenantId, roomTypeId, unitNumber: "S1" });
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("rejects bad values with specific codes", async () => {
    expect(
      await upsertHotelSettings(tenantId, { ...BASE, checkinTime: "2pm" }),
    ).toMatchObject({ ok: false, code: "INVALID_TIME" });
    expect(
      await upsertHotelSettings(tenantId, { ...BASE, depositPercent: 130 }),
    ).toMatchObject({ ok: false, code: "INVALID_DEPOSIT" });
    expect(
      await upsertHotelSettings(tenantId, { ...BASE, cancellationPenaltyPercent: 150 }),
    ).toMatchObject({ ok: false, code: "INVALID_POLICY" });
    expect(
      await upsertHotelSettings(tenantId, { ...BASE, timezone: "Mars/Olympus" }),
    ).toMatchObject({ ok: false, code: "INVALID_TIMEZONE" });
  });

  it("upserts, updates, and snapshots the policy into a booking", async () => {
    expect(await upsertHotelSettings(tenantId, BASE)).toMatchObject({ ok: true });
    let saved = await getHotelSettings(tenantId);
    expect(saved?.cancellationPolicy).toEqual({ freeUntilDays: 3, penaltyPercent: 50 });

    // Update in place (row exists → conflict path).
    expect(
      await upsertHotelSettings(tenantId, {
        ...BASE,
        depositPercent: 50,
        cancellationFreeUntilDays: null,
        cancellationPenaltyPercent: null,
      }),
    ).toMatchObject({ ok: true });
    saved = await getHotelSettings(tenantId);
    expect(saved?.depositPercent).toBe(50);
    expect(saved?.cancellationPolicy).toBeNull();

    // Set a policy again, then book: the reservation snapshots it.
    await upsertHotelSettings(tenantId, { ...BASE, depositPercent: 50 });
    const hold = await createHold({
      tenantId,
      roomTypeId,
      checkIn: "2035-01-10",
      checkOut: "2035-01-12",
      holdSession: "settings-test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "settings-test",
      guestName: "Policy Guest",
      guestEmail: "policy@example.com",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // 2 nights x 40000 = 80000; deposit 50%.
    expect(confirmed.data.depositMinor).toBe(40_000);
    const [row] = await db()
      .select({ snapshot: reservations.cancellationPolicySnapshot })
      .from(reservations)
      .where(eq(reservations.id, confirmed.data.reservationId));
    expect(row.snapshot).toEqual({ freeUntilDays: 3, penaltyPercent: 50 });
  });
});
