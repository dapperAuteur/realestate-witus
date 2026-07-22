import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { tenantDomains, tenants } from "@/db/schema";
import { hasDatabase } from "@/lib/env";

// Host → tenant resolution (pattern: witus-learn src/lib/tenant.ts).
// Every tenant-facing page resolves the tenant from the request Host.

export type TenantRecord = typeof tenants.$inferSelect;

/** Lowercase, strip port and trailing dot. */
export function normalizeHost(rawHost: string): string {
  return rawHost.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export async function getTenantByHost(
  rawHost: string | null | undefined,
): Promise<TenantRecord | null> {
  if (!rawHost || !hasDatabase) return null;
  const host = normalizeHost(rawHost);
  const rows = await db()
    .select({ tenant: tenants })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
    .where(eq(tenantDomains.host, host))
    .limit(1);
  const tenant = rows[0]?.tenant ?? null;
  return tenant && tenant.isActive ? tenant : null;
}

/** Slug lookup for webhook routes, where there is no tenant Host to resolve. */
export async function getTenantBySlug(slug: string): Promise<TenantRecord | null> {
  if (!slug || !hasDatabase) return null;
  const rows = await db()
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  const tenant = rows[0] ?? null;
  return tenant && tenant.isActive ? tenant : null;
}

/** Per-request memoized resolution from the incoming Host header. */
export const resolveTenant = cache(async (): Promise<TenantRecord | null> => {
  const h = await headers();
  return getTenantByHost(h.get("host"));
});

export async function requireTenant(): Promise<TenantRecord> {
  const tenant = await resolveTenant();
  if (!tenant) {
    throw new Error("No tenant resolved for this host");
  }
  return tenant;
}
