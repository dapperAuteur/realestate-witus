import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cloneListingInto, demoSourceListingId } from "./clone";
import {
  listings,
  mediaAssets,
  properties,
  supportMessages,
  supportThreads,
  tenantDomains,
  tenants,
} from "@/db/schema";

// Demo agency content, shared by scripts/seed-demo.ts and the nightly reset
// cron. Copy describes a FICTIONAL brokerage — no real agent, address, or
// phone number appears, and nothing here routes anywhere.
//
// The demo exercises the platform spine (brand resolution, the admin
// surfaces, RBAC across two roles) and, once BAM picks one, a real listing:
// seedDemoContent copies his chosen live listing in fresh every night
// (clone.ts). Until he picks one, the demo agency has no listings.

export const DEMO_TENANT_SLUG = "demo-agency";
/** The demo owner's stable user id (accounts.ts); the copied listing names them as its agent. */
export const DEMO_OWNER_USER_ID = "demo-admin";
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
  // Listings before media: tour scenes, listing photos, floor plans and moment
  // photos reference media_assets ON DELETE RESTRICT, so deleting media first
  // would fail the whole reset once the demo holds a listing. Deleting a
  // listing cascades to its scenes (and their links, hotspots and moment
  // photos), floor plans, moments, photos, inquiries and view counts.
  // Properties restrict deletion while a listing points at them, so they go
  // second; their buildings and units cascade with them.
  await db().delete(listings).where(eq(listings.tenantId, tenantId));
  await db().delete(properties).where(eq(properties.tenantId, tenantId));
  await db().delete(mediaAssets).where(eq(mediaAssets.tenantId, tenantId));
}

/**
 * Restores the demo baseline: a fresh copy of the listing BAM chose for the
 * demo (flags.demoSourceListingId on the platform tenant), shown by the demo
 * owner. No choice, or a source that isn't live, leaves the demo without a
 * listing rather than failing the reset.
 */
export async function seedDemoContent(tenantId: string): Promise<{ copied: boolean; reason?: string }> {
  const sourceId = await demoSourceListingId();
  if (!sourceId) return { copied: false, reason: "No demo listing chosen yet." };
  const result = await cloneListingInto(sourceId, tenantId, { agentUserId: DEMO_OWNER_USER_ID });
  return result.ok ? { copied: true } : { copied: false, reason: result.error };
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
