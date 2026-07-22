// Domain mapping lib against Neon (skips without a DB URL). Vercel calls are
// not exercised here (separate lib, no token in tests) — this covers the DB
// truth: validation, cross-tenant collisions, add/remove round trip.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import {
  addTenantDomain,
  listTenantsWithDomains,
  removeTenantDomain,
  validateHost,
} from "./domains";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe("validateHost", () => {
  it("normalizes and accepts real hostnames", () => {
    expect(validateHost("Demo.Stay.WitUS.online")).toEqual({
      ok: true,
      data: "demo.stay.witus.online",
    });
    expect(validateHost("hotel.example.com:443")).toEqual({
      ok: true,
      data: "hotel.example.com",
    });
  });

  it("rejects schemes, paths, bare labels, and garbage", () => {
    for (const bad of ["https://x.com", "x.com/path", "localhost", "no spaces.com", ""]) {
      expect(validateHost(bad).ok, bad).toBe(false);
    }
  });
});

describe.skipIf(!hasDb)("domain mapping against Neon", () => {
  let tenantA: string;
  let tenantB: string;
  const HOST = `itest-${randomUUID().slice(0, 8)}.example.com`;

  beforeAll(async () => {
    const rows = await db()
      .insert(tenants)
      .values([
        { slug: `itest-dom-a-${randomUUID().slice(0, 6)}`, name: "Dom A" },
        { slug: `itest-dom-b-${randomUUID().slice(0, 6)}`, name: "Dom B" },
      ])
      .returning({ id: tenants.id });
    tenantA = rows[0].id;
    tenantB = rows[1].id;
  });

  afterAll(async () => {
    await db().delete(tenants).where(eq(tenants.id, tenantA));
    await db().delete(tenants).where(eq(tenants.id, tenantB));
  });

  it("maps a host, is idempotent for the same tenant, blocks other tenants", async () => {
    expect(await addTenantDomain(tenantA, HOST)).toMatchObject({ ok: true });
    expect(await addTenantDomain(tenantA, HOST)).toMatchObject({ ok: true });
    expect(await addTenantDomain(tenantB, HOST)).toMatchObject({
      ok: false,
      code: "HOST_TAKEN",
    });

    const list = await listTenantsWithDomains();
    const a = list.find((t) => t.id === tenantA);
    expect(a?.domains.some((domain) => domain.host === HOST)).toBe(true);

    const domainId = a?.domains.find((domain) => domain.host === HOST)?.id ?? "";
    // Wrong tenant cannot remove it.
    expect(await removeTenantDomain(tenantB, domainId)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await removeTenantDomain(tenantA, domainId)).toMatchObject({
      ok: true,
      data: { host: HOST },
    });
  });
});
