// Audit ledger against Neon (skips without a DB URL).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { listAudit, writeAudit } from "./audit";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("audit log against Neon", () => {
  let tenantId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-audit-${randomUUID().slice(0, 8)}`, name: "Audit Test" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Tenant cascade nulls tenant_id on audit rows; remove our rows explicitly.
    const rows = await listAudit({ tenantId, limit: 200 });
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
    for (const row of rows) {
      await db().execute(
        (await import("drizzle-orm")).sql`delete from audit_log where id = ${row.id}`,
      );
    }
  });

  it("writes and filters by tenant and kind prefix", async () => {
    await writeAudit({
      tenantId,
      kind: "billing.invoice.created",
      summary: "Invoice X created",
      data: { code: "INV-TEST" },
    });
    await writeAudit({
      tenantId,
      kind: "booking.transition",
      summary: "Reservation checked in",
    });

    const all = await listAudit({ tenantId });
    expect(all.length).toBeGreaterThanOrEqual(2);

    const billingOnly = await listAudit({ tenantId, kindPrefix: "billing." });
    expect(billingOnly.every((row) => row.kind.startsWith("billing."))).toBe(true);
    expect(billingOnly.some((row) => row.summary === "Invoice X created")).toBe(true);
  });
});
