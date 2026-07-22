// Demo machinery against Neon (skips without a DB URL). Proves the reset
// really restores the baseline after guest activity, stays scoped to the
// demo tenant, and that the demo credential accounts can sign in.
//
// NOTE: this suite operates on the REAL bam-hotel demo tenant (that is the
// point of the reset — it must be safe to run against production data).

import { and, eq } from "drizzle-orm";
import { tableExists } from "@/lib/db-probe";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { reservations, roomTypes, tenants, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { createHold, confirmHold } from "@/lib/booking/holds";
import { ensureDemoAccounts, resetDemoData, setupDemo } from "./accounts";
import { DEMO_TENANT_SLUG } from "./seed";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);
// Booking inserts include migration-0002 columns (drizzle lists every schema
// column), so these suites need the migration; they self-skip until task 07.
const ready = hasDb && (await tableExists("promo_codes"));

// Test-only demo credentials (vitest.setup provides auth fallbacks; these
// stand in for BAM's real DEMO_* values).
process.env.DEMO_ADMIN_USER_EMAIL ??= "demo-admin@stay-witus.test";
process.env.DEMO_ADMIN_PASSWORD ??= "vitest-demo-admin-pass-1";
process.env.DEMO_VISITOR_USER_EMAIL ??= "demo-visitor@stay-witus.test";
process.env.DEMO_VISITOR_PASSWORD ??= "vitest-demo-visitor-pass-1";

describe.skipIf(!ready)("demo reset + logins against Neon (needs migration 0002)", () => {
  afterAll(async () => {
    // Leave the demo tenant itself in place (it is production state), but
    // remove the test-credential users if this run created them with the
    // fallback emails above (BAM's real env would use his addresses).
    for (const email of [
      "demo-admin@stay-witus.test",
      "demo-visitor@stay-witus.test",
    ]) {
      await db().delete(users).where(eq(users.email, email));
    }
  });

  it("reset wipes guest activity and restores the baseline", async () => {
    const setup = await setupDemo();
    expect(setup.ok).toBe(true);
    if (!setup.ok) return;
    const tenantId = setup.data.tenantId;

    const [roomType] = await db()
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(eq(roomTypes.tenantId, tenantId))
      .limit(1);
    const hold = await createHold({
      tenantId,
      roomTypeId: roomType.id,
      checkIn: "2033-02-01",
      checkOut: "2033-02-03",
      holdSession: "demo-reset-test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "demo-reset-test",
      guestName: "Reset Test Guest",
      guestEmail: "reset-test@example.com",
    });
    expect(confirmed.ok).toBe(true);

    const reset = await resetDemoData();
    expect(reset.ok).toBe(true);

    const leftover = await db()
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.tenantId, tenantId));
    expect(leftover).toHaveLength(0);

    const rooms = await db()
      .select({ slug: roomTypes.slug })
      .from(roomTypes)
      .where(eq(roomTypes.tenantId, tenantId));
    expect(rooms.map((r) => r.slug).sort()).toEqual([
      "family-room",
      "garden-queen",
      "rooftop-suite",
    ]);
  });

  it("reset never touches other tenants", async () => {
    const [other] = await db()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, "stay-witus"))
      .limit(1);
    expect(other).toBeTruthy(); // platform tenant survived the reset above
  });

  it("demo credential accounts can sign in with the env passwords", async () => {
    const [tenant] = await db()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, DEMO_TENANT_SLUG))
      .limit(1);
    const ensured = await ensureDemoAccounts(tenant.id);
    expect(ensured.ok).toBe(true);

    const response = await auth().api.signInEmail({
      body: {
        email: process.env.DEMO_ADMIN_USER_EMAIL as string,
        password: process.env.DEMO_ADMIN_PASSWORD as string,
      },
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get("set-cookie") ?? "").toContain("session_token");

    const bad = await auth()
      .api.signInEmail({
        body: {
          email: process.env.DEMO_ADMIN_USER_EMAIL as string,
          password: "wrong-password",
        },
        asResponse: true,
      })
      .catch(() => null);
    expect(bad === null || !bad.ok).toBe(true);
  });
});
