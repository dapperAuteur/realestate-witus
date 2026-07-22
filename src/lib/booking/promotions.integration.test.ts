// Promotions against Neon — GATED until migration 0002 is applied (user-task
// 07): probes for promo_codes and skips itself cleanly beforehand, so the
// suite stays green pre-migration and activates after.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { promoCodes, roomTypes, roomUnits, tenants } from "@/db/schema";
import { audienceRecipients, suppressEmail } from "@/lib/campaigns";
import { tableExists } from "@/lib/db-probe";
import { confirmHold, createHold } from "./holds";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

const ready = hasDb && (await tableExists("promo_codes"));

describe.skipIf(!ready)("promotions against Neon (needs migration 0002)", () => {
  let tenantId: string;
  let roomTypeId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-promo-${randomUUID().slice(0, 8)}`, name: "Promo Test Hotel" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
    const [rt] = await db()
      .insert(roomTypes)
      .values({ tenantId, slug: "promo-room", name: "Promo Room", baseRateMinor: 50_000 })
      .returning({ id: roomTypes.id });
    roomTypeId = rt.id;
    await db()
      .insert(roomUnits)
      .values([
        { tenantId, roomTypeId, unitNumber: "P1" },
        { tenantId, roomTypeId, unitNumber: "P2" },
      ]);
    await db().insert(promoCodes).values({
      tenantId,
      code: "TEST25",
      kind: "percent",
      value: 25,
      maxRedemptions: 1,
    });
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  async function bookWith(code: string | undefined, session: string, optIn = false) {
    const hold = await createHold({
      tenantId,
      roomTypeId,
      checkIn: "2034-05-01",
      checkOut: "2034-05-03",
      holdSession: session,
    });
    if (!hold.ok) throw new Error(hold.code);
    return confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: session,
      guestName: "Promo Guest",
      guestEmail: `${session}@example.com`,
      promoCode: code,
      marketingOptIn: optIn,
    });
  }

  it("applies percent discount to total and deposit; case-insensitive", async () => {
    const confirmed = await bookWith("test25", "promo-a", true);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // 2 nights x 50000 = 100000; 25% off -> 75000; 30% deposit of that.
    expect(confirmed.data.discountMinor).toBe(25_000);
    expect(confirmed.data.totalMinor).toBe(75_000);
    expect(confirmed.data.depositMinor).toBe(22_500);
  });

  it("max redemptions holds; the hold survives and confirms without the code", async () => {
    const hold = await createHold({
      tenantId,
      roomTypeId,
      checkIn: "2034-05-01",
      checkOut: "2034-05-03",
      holdSession: "promo-b",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;

    // TEST25 was exhausted by the first booking (maxRedemptions 1).
    const withCode = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "promo-b",
      guestName: "Promo Guest",
      guestEmail: "promo-b@example.com",
      promoCode: "TEST25",
    });
    expect(withCode).toMatchObject({ ok: false, code: "PROMO_INVALID" });

    // The failed confirm must NOT burn the hold: retry without the code works.
    const retry = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "promo-b",
      guestName: "Promo Guest",
      guestEmail: "promo-b@example.com",
    });
    expect(retry.ok && retry.data.discountMinor === 0).toBe(true);
  });

  it("campaign audience honors opt-in and suppression", async () => {
    // promo-a opted in above; promo-c did not.
    const before = await audienceRecipients(tenantId, "all_subscribers", "2034-01-01");
    expect(before.map((r) => r.email)).toEqual(["promo-a@example.com"]);

    await suppressEmail(tenantId, "PROMO-A@example.com");
    const after = await audienceRecipients(tenantId, "all_subscribers", "2034-01-01");
    expect(after).toHaveLength(0);
  });
});
