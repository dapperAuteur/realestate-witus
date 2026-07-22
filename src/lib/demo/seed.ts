import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, supportMessages, supportThreads, tenantDomains, tenants } from "@/db/schema";

// Demo agency content, shared by scripts/seed-demo.ts and the nightly reset
// cron. Copy describes a FICTIONAL brokerage — no real agent, address, or
// phone number appears, and nothing here routes anywhere.
//
// The demo currently exercises the platform spine: brand resolution (preset,
// font pair, template), the admin surfaces, and RBAC across two roles. Sample
// listings and a real 360 tour join seedDemoContent when the listings
// workstream lands; the wipe/seed/reset shape is already built for them.

export const DEMO_TENANT_SLUG = "demo-agency";
export const DEMO_HOST = "demo.realestate.witus.online";

const DEMO_NAME = "Meridian Property Group";
const DEMO_TAGLINE = "Commercial and residential listings, walked before they are shown";

/** Upserts the tenant row + domain mapping; returns the tenant id. */
export async function ensureDemoTenant(): Promise<string> {
  const [tenant] = await db()
    .insert(tenants)
    .values({
      slug: DEMO_TENANT_SLUG,
      name: DEMO_NAME,
      tagline: DEMO_TAGLINE,
      flags: { poweredBy: true },
      theme: {
        name: DEMO_NAME,
        presetKey: "atlantic",
        fontPairKey: "classic",
        templateKey: "editorial",
      },
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        name: DEMO_NAME,
        tagline: DEMO_TAGLINE,
        // Reset undoes whatever the demo owner changed in /admin/design.
        flags: { poweredBy: true },
        theme: {
          name: DEMO_NAME,
          presetKey: "atlantic",
          fontPairKey: "classic",
          templateKey: "editorial",
        },
        updatedAt: new Date(),
      },
    })
    .returning({ id: tenants.id });

  await db()
    .insert(tenantDomains)
    .values({ tenantId: tenant.id, host: DEMO_HOST, isPrimary: true })
    .onConflictDoNothing({ target: tenantDomains.host });
  return tenant.id;
}

/**
 * Deletes everything a demo visitor could have created, in FK order. Every
 * statement filters the demo tenant id — nothing here can reach a real
 * agency's rows. Memberships and the tenant itself survive so the demo
 * accounts keep working across a reset.
 */
export async function wipeDemoContent(tenantId: string): Promise<void> {
  const threads = await db()
    .select({ id: supportThreads.id })
    .from(supportThreads)
    .where(eq(supportThreads.tenantId, tenantId));
  const threadIds = threads.map((t) => t.id);
  if (threadIds.length > 0) {
    await db()
      .delete(supportMessages)
      .where(inArray(supportMessages.threadId, threadIds));
    await db().delete(supportThreads).where(eq(supportThreads.tenantId, tenantId));
  }
  await db().delete(mediaAssets).where(eq(mediaAssets.tenantId, tenantId));
}

/**
 * Restores the demo baseline. Listings, tour scenes, and their media land
 * here with the listings workstream; today the tenant row written by
 * ensureDemoTenant is the whole baseline, so this is deliberately a no-op
 * rather than a missing step.
 */
export async function seedDemoContent(tenantId: string): Promise<void> {
  void tenantId;
}

/** True once the demo tenant carries seeded content (not just the tenant row). */
export async function demoTenantHasContent(tenantId: string): Promise<boolean> {
  const [existing] = await db()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.status, "ready")))
    .limit(1);
  return Boolean(existing);
}
