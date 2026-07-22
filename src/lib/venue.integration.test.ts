// Venue inquiry pipeline against Neon (skips without a DB URL).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { listInquiriesAdmin, setInquiryStatus, submitVenueInquiry } from "./venue";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("venue inquiries against Neon", () => {
  let tenantId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-venue-${randomUUID().slice(0, 8)}`, name: "Venue Test Hotel" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("validates, saves, surfaces new-first, and moves through the pipeline", async () => {
    expect(
      await submitVenueInquiry(tenantId, { name: "", email: "bad" }),
    ).toMatchObject({ ok: false, code: "INVALID_GUEST" });

    const created = await submitVenueInquiry(tenantId, {
      name: "Efua Planner",
      email: "Efua@Example.com",
      eventType: "Birthday dinner",
      preferredDate: "2036-09-12",
      partySize: 24,
      budgetRange: "GHS 5-8k",
      message: "Rooftop if possible.",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listInquiriesAdmin(tenantId);
    expect(list[0]).toMatchObject({
      email: "efua@example.com", // lowercased
      status: "new",
      partySize: 24,
    });

    expect(await setInquiryStatus(tenantId, created.data.id, "quoted")).toMatchObject({
      ok: true,
    });
    expect(
      await setInquiryStatus(randomUUID(), created.data.id, "confirmed"),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
