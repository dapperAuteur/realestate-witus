// Integration tests against the real Neon database (skipped when no
// STORAGE_DATABASE_URL / DATABASE_URL is loaded — see vitest.setup.ts).
// Everything runs inside a throwaway tenant that is cascade-deleted in
// afterAll, so no shared table is touched beyond rows created here.

import { randomUUID } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { roomTypes, roomUnits, tenants, unitClaims } from "@/db/schema";
import { stayRange } from "@/db/schema/_types";
import { getAvailability } from "./availability";
import { createHold, pgErrorCode, releaseHold } from "./holds";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

const CHECK_IN = "2030-03-10";
const CHECK_OUT = "2030-03-13";

describe.skipIf(!hasDb)("hold lifecycle against Neon", () => {
  let tenantId: string;
  let roomTypeId: string;
  let unitId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({
        slug: `itest-booking-${randomUUID().slice(0, 8)}`,
        name: "Integration Test Hotel",
        isActive: true,
      })
      .returning({ id: tenants.id });
    tenantId = tenant.id;

    const [roomType] = await db()
      .insert(roomTypes)
      .values({
        tenantId,
        slug: "test-queen",
        name: "Test Queen",
        baseRateMinor: 50_000,
      })
      .returning({ id: roomTypes.id });
    roomTypeId = roomType.id;

    // Exactly ONE unit: the whole point is fighting over the last one.
    const [unit] = await db()
      .insert(roomUnits)
      .values({ tenantId, roomTypeId, unitNumber: "101" })
      .returning({ id: roomUnits.id });
    unitId = unit.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await db().delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it("two concurrent holds on the last unit: exactly one wins", async () => {
    const [a, b] = await Promise.all([
      createHold({
        tenantId,
        roomTypeId,
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
        holdSession: "session-a",
      }),
      createHold({
        tenantId,
        roomTypeId,
        checkIn: CHECK_IN,
        checkOut: CHECK_OUT,
        holdSession: "session-b",
      }),
    ]);

    const wins = [a, b].filter((r) => r.ok);
    const losses = [a, b].filter((r) => !r.ok);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({ ok: false, code: "NO_AVAILABILITY" });
  });

  it("the live hold hides the unit from availability (lazy read filter)", async () => {
    const result = await getAvailability({
      tenantId,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].freeUnits).toBe(0);
    // Rate math rides along: 3 nights at the base rate.
    expect(result.data[0].rates.totalMinor).toBe(150_000);
  });

  it("the exclusion constraint rejects a raw overlapping write", async () => {
    // Bypasses the engine on purpose: even a buggy code path cannot
    // double-book because the DB refuses the row.
    let code: string | undefined;
    try {
      await db()
        .insert(unitClaims)
        .values({
          tenantId,
          unitId,
          roomTypeId,
          stay: stayRange("2030-03-12", "2030-03-14"), // overlaps the live hold
          kind: "blockout",
          reason: "should never land",
        });
    } catch (error) {
      code = pgErrorCode(error);
    }
    expect(code).toBe("23P01");
  });

  it("an expired hold is released by the next claim and stops blocking", async () => {
    // Clear the winner from the concurrency test, whichever session owns it.
    const [live] = await db()
      .select({ id: unitClaims.id, holdSession: unitClaims.holdSession })
      .from(unitClaims)
      .where(
        and(
          eq(unitClaims.tenantId, tenantId),
          eq(unitClaims.kind, "hold"),
          isNotNull(unitClaims.expiresAt),
        ),
      )
      .limit(1);
    if (live) {
      await releaseHold({
        tenantId,
        claimId: live.id,
        holdSession: live.holdSession ?? "",
      });
    }

    // holdMinutes 0 → expires_at = now(), i.e. already lapsed.
    const stale = await createHold({
      tenantId,
      roomTypeId,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      holdSession: "session-stale",
      holdMinutes: 0,
    });
    expect(stale.ok).toBe(true);

    // Reads ignore it...
    const search = await getAvailability({
      tenantId,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    });
    expect(search.ok && search.data[0].freeUnits).toBe(1);

    // ...and the write path physically releases it before claiming, so the
    // exclusion index does not false-positive on the stale row.
    const fresh = await createHold({
      tenantId,
      roomTypeId,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      holdSession: "session-fresh",
    });
    expect(fresh.ok).toBe(true);

    if (stale.ok) {
      const [staleClaim] = await db()
        .select({ releasedAt: unitClaims.releasedAt })
        .from(unitClaims)
        .where(eq(unitClaims.id, stale.data.claimId));
      expect(staleClaim.releasedAt).not.toBeNull();
    }
  });
});
