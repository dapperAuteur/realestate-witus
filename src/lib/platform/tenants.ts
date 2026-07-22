import { asc, eq, sql } from "drizzle-orm";
import { pgErrorCode } from "@/lib/booking/holds";
import { db } from "@/db";
import { tenantDomains, tenants, type TenantFlags } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

// Tenant CRUD for /platform (workstream 12): onboarding customer #2 without
// SQL. Creating a tenant starts it comingSoon so nothing half-configured
// ever faces guests.

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** The flags BAM toggles per tenant; platform flag is deliberately absent. */
export const EDITABLE_FLAGS = [
  "events",
  "dining",
  "concierge",
  "virtualTour",
  "announcements",
  "hub",
  "comingSoon",
  "poweredBy",
] as const;
export type EditableFlag = (typeof EDITABLE_FLAGS)[number];

export async function listTenantsAdmin() {
  const rows = await db()
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      tagline: tenants.tagline,
      isActive: tenants.isActive,
      flags: tenants.flags,
      domainCount: sql<number>`(select count(*)::int from ${tenantDomains} d where d.tenant_id = ${tenants.id})`,
    })
    .from(tenants)
    .orderBy(asc(tenants.slug));
  return rows;
}

export async function createTenant(
  slug: string,
  name: string,
): Promise<Result<{ id: string }>> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!SLUG_RE.test(cleanSlug)) {
    return err(
      "INVALID_SLUG",
      "Slugs are 3-40 lowercase letters, numbers, and dashes.",
    );
  }
  if (!name.trim()) return err("INVALID_NAME", "Give the property a name.");
  try {
    const [row] = await db()
      .insert(tenants)
      .values({
        slug: cleanSlug,
        name: name.trim(),
        // New tenants never face guests until BAM flips comingSoon off.
        flags: { comingSoon: true, poweredBy: true },
        theme: {},
      })
      .returning({ id: tenants.id });
    return ok({ id: row.id });
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return err("SLUG_TAKEN", "That slug already exists.");
    }
    throw error;
  }
}

export async function updateTenantAdmin(
  tenantId: string,
  input: {
    name: string;
    tagline: string;
    isActive: boolean;
    flags: Partial<Record<EditableFlag, boolean>>;
  },
): Promise<Result<{ updated: boolean }>> {
  if (!input.name.trim()) return err("INVALID_NAME", "Give the property a name.");
  const [current] = await db()
    .select({ flags: tenants.flags })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!current) return err("NOT_FOUND", "Tenant not found.");

  // Preserve non-editable flags (platform) exactly as stored.
  const flags: TenantFlags = { ...current.flags };
  for (const key of EDITABLE_FLAGS) {
    flags[key] = Boolean(input.flags[key]);
  }

  await db()
    .update(tenants)
    .set({
      name: input.name.trim(),
      tagline: input.tagline.trim() || null,
      isActive: input.isActive,
      flags,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
  return ok({ updated: true });
}
