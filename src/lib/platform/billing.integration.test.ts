// Platform billing lifecycle against Neon (skips without a DB URL):
// pricing upsert, invoice create → owner claim → queue → confirm paid,
// tenant guards, void rules. Throwaway tenants, cascade-deleted.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import {
  claimMomoInvoice,
  confirmInvoicePaid,
  createInvoice,
  getTenantBilling,
  listInvoicesForTenant,
  pendingMomoQueue,
  upsertTenantBilling,
  voidInvoice,
} from "./billing";
import { createTenant, listTenantsAdmin, updateTenantAdmin } from "./tenants";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("platform admin against Neon", () => {
  const slug = `itest-plat-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let invoiceId: string;

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("tenant create validates, starts comingSoon, and rejects duplicate slugs", async () => {
    expect(await createTenant("Bad Slug!", "X")).toMatchObject({
      ok: false,
      code: "INVALID_SLUG",
    });
    const created = await createTenant(slug, "Platform Test Hotel");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    tenantId = created.data.id;
    expect(await createTenant(slug, "Again")).toMatchObject({
      ok: false,
      code: "SLUG_TAKEN",
    });

    const rows = await listTenantsAdmin();
    const mine = rows.find((t) => t.id === tenantId);
    expect(mine?.flags).toMatchObject({ comingSoon: true, poweredBy: true });

    const updated = await updateTenantAdmin(tenantId, {
      name: "Platform Test Hotel",
      tagline: "Testing",
      isActive: true,
      flags: { events: true, comingSoon: false, poweredBy: true },
    });
    expect(updated.ok).toBe(true);
    const after = (await listTenantsAdmin()).find((t) => t.id === tenantId);
    expect(after?.flags).toMatchObject({ events: true, comingSoon: false, dining: false });
  });

  it("pricing upserts with validation", async () => {
    expect(
      await upsertTenantBilling(tenantId, {
        setupFeeMinor: 100_000,
        monthlyFeeMinor: 25_000,
        currency: "usd",
        billingEmail: "",
        notes: "",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_CURRENCY" });
    expect(
      await upsertTenantBilling(tenantId, {
        setupFeeMinor: 100_000,
        monthlyFeeMinor: 25_000,
        currency: "USD",
        billingEmail: "owner@example.com",
        notes: "first client pricing",
      }),
    ).toMatchObject({ ok: true });
    const billing = await getTenantBilling(tenantId);
    expect(billing).toMatchObject({ monthlyFeeMinor: 25_000, currency: "USD" });
  });

  it("invoice lifecycle: create → claim → queue → confirm; guards hold", async () => {
    const created = await createInvoice(tenantId, {
      kind: "monthly",
      description: "July",
      amountMinor: 25_000,
      currency: "USD",
      dueDate: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    invoiceId = created.data.id;
    expect(created.data.code).toMatch(/^INV-\d{4}-[A-Z2-9]{4}$/);

    // Wrong tenant cannot claim.
    expect(await claimMomoInvoice(randomUUID(), invoiceId)).toMatchObject({
      ok: true,
      data: { claimed: false },
    });
    // Owner claims; second claim is a no-op.
    expect(await claimMomoInvoice(tenantId, invoiceId)).toMatchObject({
      ok: true,
      data: { claimed: true },
    });
    expect(await claimMomoInvoice(tenantId, invoiceId)).toMatchObject({
      ok: true,
      data: { claimed: false },
    });

    const queue = await pendingMomoQueue();
    expect(queue.some((q) => q.invoice.id === invoiceId)).toBe(true);

    expect(await confirmInvoicePaid(invoiceId, null, "momo")).toMatchObject({
      ok: true,
      data: { paid: true },
    });
    expect((await pendingMomoQueue()).some((q) => q.invoice.id === invoiceId)).toBe(false);
    expect(await confirmInvoicePaid(invoiceId, null, "momo")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });

    // Paid invoices cannot be voided; open ones can.
    expect(await voidInvoice(invoiceId)).toMatchObject({
      ok: true,
      data: { voided: false },
    });
    const second = await createInvoice(tenantId, {
      kind: "custom",
      description: "voidable",
      amountMinor: 5_000,
      currency: "USD",
      dueDate: null,
    });
    if (!second.ok) throw new Error(second.code);
    expect(await voidInvoice(second.data.id)).toMatchObject({
      ok: true,
      data: { voided: true },
    });

    const all = await listInvoicesForTenant(tenantId);
    expect(all.map((i) => i.status).sort()).toEqual(["paid", "void"]);
  });
});
