import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenantDomains, tenants } from "@/db/schema";
import { normalizeHost } from "@/lib/tenant";
import { err, ok, type Result } from "@/lib/result";

// DB side of domain management (platform surface). The Vercel API leg lives
// in vercel-domains.ts; these stay separate so the DB mapping works (and is
// testable) even before VERCEL_DOMAINS_TOKEN exists.

/** Hostname shape only — lowercase labels, at least one dot, no scheme/path. */
const HOST_RE =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function validateHost(raw: string): Result<string> {
  const host = normalizeHost(raw.trim());
  if (!HOST_RE.test(host)) {
    return err("INVALID_HOST", "Enter a bare domain like hotel.example.com.");
  }
  return ok(host);
}

export async function listTenantsWithDomains() {
  const [tenantRows, domainRows] = await Promise.all([
    db()
      .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
      .from(tenants)
      .orderBy(asc(tenants.slug)),
    db()
      .select({
        id: tenantDomains.id,
        tenantId: tenantDomains.tenantId,
        host: tenantDomains.host,
        isPrimary: tenantDomains.isPrimary,
      })
      .from(tenantDomains)
      .orderBy(asc(tenantDomains.host)),
  ]);
  const byTenant = new Map<string, typeof domainRows>();
  for (const row of domainRows) {
    const list = byTenant.get(row.tenantId) ?? [];
    list.push(row);
    byTenant.set(row.tenantId, list);
  }
  return tenantRows.map((t) => ({ ...t, domains: byTenant.get(t.id) ?? [] }));
}

export async function addTenantDomain(
  tenantId: string,
  rawHost: string,
): Promise<Result<{ host: string }>> {
  const valid = validateHost(rawHost);
  if (!valid.ok) return valid;
  const host = valid.data;

  const [tenant] = await db()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return err("TENANT_NOT_FOUND", "Tenant not found.");

  const inserted = await db()
    .insert(tenantDomains)
    .values({ tenantId, host })
    .onConflictDoNothing({ target: tenantDomains.host })
    .returning({ id: tenantDomains.id });
  if (inserted.length === 0) {
    const [existing] = await db()
      .select({ tenantId: tenantDomains.tenantId })
      .from(tenantDomains)
      .where(eq(tenantDomains.host, host));
    if (existing?.tenantId === tenantId) return ok({ host });
    return err("HOST_TAKEN", "That domain is already mapped to another property.");
  }
  return ok({ host });
}

export async function removeTenantDomain(
  tenantId: string,
  domainId: string,
): Promise<Result<{ host: string | null }>> {
  const rows = await db()
    .delete(tenantDomains)
    .where(
      and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)),
    )
    .returning({ host: tenantDomains.host });
  if (rows.length === 0) return err("NOT_FOUND", "Domain mapping not found.");
  return ok({ host: rows[0].host });
}
