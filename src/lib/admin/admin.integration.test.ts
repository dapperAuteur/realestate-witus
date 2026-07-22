// Admin lib against real Neon (skips without a DB URL). Exercises the desk
// paths end to end: blockouts vs the exclusion constraint, the reservation
// state machine (cancel must free the unit), pricing overrides, and the
// today board. Throwaway tenant, cascade-deleted in afterAll.

import { randomUUID } from "node:crypto";
import { tableExists } from "@/lib/db-probe";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { roomTypes, roomUnits, tenantMemberships, tenants, unitClaims, users } from "@/db/schema";
import { createBlockout, getUnitMonth, releaseBlockout } from "./blockouts";
import { createRateOverride, deleteRateOverride, getPricingMonth } from "./pricing";
import { listReservations, transitionReservation } from "./reservations";
import { getTodayBoard, localToday } from "./today";
import { acceptStaffInvite, createStaffInvite } from "./invites";
import { addDays } from "@/lib/booking/dates";
import { confirmHold, createHold } from "@/lib/booking/holds";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);
// Booking inserts include migration-0002 columns (drizzle lists every schema
// column), so these suites need the migration; they self-skip until task 07.
const ready = hasDb && (await tableExists("promo_codes"));

describe.skipIf(!ready)("admin surfaces against Neon (needs migration 0002)", () => {
  let tenantId: string;
  let roomTypeId: string;
  let unitId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-admin-${randomUUID().slice(0, 8)}`, name: "Admin Test Hotel" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
    const [rt] = await db()
      .insert(roomTypes)
      .values({ tenantId, slug: "admin-room", name: "Admin Room", baseRateMinor: 30_000 })
      .returning({ id: roomTypes.id });
    roomTypeId = rt.id;
    const [unit] = await db()
      .insert(roomUnits)
      .values({ tenantId, roomTypeId, unitNumber: "A1" })
      .returning({ id: roomUnits.id });
    unitId = unit.id;
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
    await db().delete(users).where(eq(users.id, "itest-invitee"));
  });

  it("blockout collides with a live booking, then works once cancelled", async () => {
    // Real booking through the engine.
    const hold = await createHold({
      tenantId,
      roomTypeId,
      checkIn: "2032-03-10",
      checkOut: "2032-03-13",
      holdSession: "admin-blockout-test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "admin-blockout-test",
      guestName: "Desk Test",
      guestEmail: "desk@example.com",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    // Overlapping blockout must lose to the exclusion constraint.
    const clash = await createBlockout({
      tenantId,
      unitId,
      startDate: "2032-03-12",
      endDate: "2032-03-14",
      reason: "maintenance",
    });
    expect(clash).toMatchObject({ ok: false, code: "OCCUPIED" });

    // Cancel frees the unit in the same transaction...
    const cancel = await transitionReservation(
      tenantId,
      confirmed.data.reservationId,
      "cancel",
    );
    expect(cancel).toMatchObject({ ok: true, data: { status: "cancelled" } });
    const [claim] = await db()
      .select({ releasedAt: unitClaims.releasedAt })
      .from(unitClaims)
      .where(
        and(
          eq(unitClaims.reservationId, confirmed.data.reservationId),
          eq(unitClaims.tenantId, tenantId),
        ),
      );
    expect(claim.releasedAt).not.toBeNull();

    // ...so the same blockout now lands.
    const retry = await createBlockout({
      tenantId,
      unitId,
      startDate: "2032-03-12",
      endDate: "2032-03-14",
      reason: "maintenance",
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;

    const grid = await getUnitMonth(tenantId, "2032-03");
    expect(grid.ok && grid.data[0].claims.some((c) => c.kind === "blockout")).toBe(true);

    const released = await releaseBlockout(tenantId, retry.data.claimId);
    expect(released).toMatchObject({ ok: true, data: { released: true } });
  });

  it("state machine: approve is invalid for pending_payment; check-in/out flows", async () => {
    const hold = await createHold({
      tenantId,
      roomTypeId,
      checkIn: "2032-05-01",
      checkOut: "2032-05-03",
      holdSession: "admin-transition-test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "admin-transition-test",
      guestName: "Flow Test",
      guestEmail: "flow@example.com",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const id = confirmed.data.reservationId;

    expect(await transitionReservation(tenantId, id, "approve")).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(await transitionReservation(tenantId, id, "check_in")).toMatchObject({
      ok: true,
      data: { status: "checked_in" },
    });
    expect(await transitionReservation(tenantId, id, "check_out")).toMatchObject({
      ok: true,
      data: { status: "checked_out" },
    });
    expect(await transitionReservation(tenantId, id, "cancel")).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });

    const list = await listReservations(tenantId, { status: "checked_out" });
    expect(list.ok && list.data.some((r) => r.id === id)).toBe(true);
  });

  it("pricing month reflects created overrides; delete removes them", async () => {
    const created = await createRateOverride({
      tenantId,
      roomTypeId,
      label: "Test Season",
      startDate: "2032-07-01",
      endDate: "2032-07-31",
      rateMinor: 45_000,
      dowMask: null,
      priority: 5,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const month = await getPricingMonth(tenantId, roomTypeId, "2032-07");
    expect(month.ok).toBe(true);
    if (!month.ok) return;
    expect(month.data.days[0]).toMatchObject({
      rateMinor: 45_000,
      overrideLabel: "Test Season",
    });

    await deleteRateOverride(tenantId, created.data.id);
    const after = await getPricingMonth(tenantId, roomTypeId, "2032-07");
    expect(after.ok && after.data.days[0].rateMinor).toBe(30_000);
  });

  it("today board sees an arrival landing today", async () => {
    const today = localToday("Africa/Accra");
    const hold = await createHold({
      tenantId,
      roomTypeId,
      checkIn: today,
      checkOut: addDays(today, 2),
      holdSession: "admin-today-test",
    });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "admin-today-test",
      guestName: "Arrival Test",
      guestEmail: "arrival@example.com",
    });
    expect(confirmed.ok).toBe(true);

    const board = await getTodayBoard(tenantId, today);
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    expect(board.data.arrivals.some((r) => r.guestName === "Arrival Test")).toBe(true);
    expect(board.data.pendingPaymentCount).toBeGreaterThanOrEqual(1);
  });

  it("invite lifecycle: email must match, single use, membership created", async () => {
    await db()
      .insert(users)
      .values({ id: "itest-invitee", email: "invitee@example.com" })
      .onConflictDoNothing();

    const invite = await createStaffInvite({
      tenantId,
      email: "Invitee@Example.com",
      role: "front_desk",
      invitedBy: "itest-invitee",
      acceptUrlBase: "http://localhost:3000/en/invite",
    });
    expect(invite.ok).toBe(true);

    const { staffInvites } = await import("@/db/schema");
    const [row] = await db()
      .select({ token: staffInvites.token })
      .from(staffInvites)
      .where(eq(staffInvites.tenantId, tenantId));

    // Wrong account is rejected before any membership write.
    const wrong = await acceptStaffInvite(row.token, {
      id: "someone-else",
      email: "other@example.com",
    });
    expect(wrong).toMatchObject({ ok: false, code: "WRONG_ACCOUNT" });

    const accepted = await acceptStaffInvite(row.token, {
      id: "itest-invitee",
      email: "invitee@example.com",
    });
    expect(accepted).toMatchObject({ ok: true, data: { role: "front_desk" } });

    const [membership] = await db()
      .select({ role: tenantMemberships.role })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, "itest-invitee"));
    expect(membership.role).toBe("front_desk");

    // Single use.
    const replay = await acceptStaffInvite(row.token, {
      id: "itest-invitee",
      email: "invitee@example.com",
    });
    expect(replay).toMatchObject({ ok: false, code: "INVITE_INVALID" });
  });
});
