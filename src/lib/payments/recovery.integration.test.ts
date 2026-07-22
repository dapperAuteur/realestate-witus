// Recovery-email pass against Neon (skips without a DB URL): selects only
// 1-48h-old unpaid pending reservations on tenants with a domain, sends once
// (email_log ledger), never twice. Mailer dev-logs (Mailgun stripped).

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  emailLog,
  reservations,
  roomTypes,
  roomUnits,
  tenantDomains,
  tenants,
} from "@/db/schema";
import { confirmHold, createHold } from "@/lib/booking/holds";
import { sendPaymentRecoveryEmails } from "./recovery";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("payment recovery against Neon", () => {
  let tenantId: string;
  let reservationId: string;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-recovery-${suffix}`, name: "Recovery Test Hotel" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
    await db()
      .insert(tenantDomains)
      .values({ tenantId, host: `itest-recovery-${suffix}.example.com`, isPrimary: true });
    const [rt] = await db()
      .insert(roomTypes)
      .values({ tenantId, slug: "rec-room", name: "Rec Room", baseRateMinor: 30_000 })
      .returning({ id: roomTypes.id });
    await db().insert(roomUnits).values({ tenantId, roomTypeId: rt.id, unitNumber: "R1" });

    const hold = await createHold({
      tenantId,
      roomTypeId: rt.id,
      checkIn: "2036-02-01",
      checkOut: "2036-02-03",
      holdSession: "recovery-test",
    });
    if (!hold.ok) throw new Error(hold.code);
    const confirmed = await confirmHold({
      tenantId,
      claimId: hold.data.claimId,
      holdSession: "recovery-test",
      guestName: "Recovery Guest",
      guestEmail: "recovery@example.com",
    });
    if (!confirmed.ok) throw new Error(confirmed.code);
    reservationId = confirmed.data.reservationId;
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("fresh reservations are NOT nagged; 2h-old ones get exactly one email", async () => {
    // Just created (< 1h): out of window.
    const first = await sendPaymentRecoveryEmails();
    expect(first.ok).toBe(true);
    let logs = await db()
      .select()
      .from(emailLog)
      .where(eq(emailLog.reservationId, reservationId));
    expect(logs).toHaveLength(0);

    // Backdate into the window.
    await db()
      .update(reservations)
      .set({ createdAt: sql`now() - interval '2 hours'` })
      .where(eq(reservations.id, reservationId));

    const second = await sendPaymentRecoveryEmails();
    expect(second.ok && second.data.sent >= 1).toBe(true);
    logs = await db()
      .select()
      .from(emailLog)
      .where(eq(emailLog.reservationId, reservationId));
    expect(logs).toHaveLength(1);

    // Idempotent: the ledger blocks a resend.
    const third = await sendPaymentRecoveryEmails();
    expect(third.ok).toBe(true);
    logs = await db()
      .select()
      .from(emailLog)
      .where(eq(emailLog.reservationId, reservationId));
    expect(logs).toHaveLength(1);
  });
});
