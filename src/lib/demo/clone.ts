import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, withTx } from "@/db";
import {
  listingPhotos,
  listings,
  mediaAssets,
  properties,
  sceneHotspots,
  sceneLinks,
  sceneMomentPanoramas,
  tenants,
  tourFloorPlans,
  tourMoments,
  tourScenes,
  users,
} from "@/db/schema";
import { isPublicStatus } from "@/lib/listings/format";
import { err, ok, type Result } from "@/lib/result";

// The demo agency's sample listing (plans/08 6.5 item 3): a copy of one of
// BAM's own live listings, made fresh on every nightly reset, so the demo
// shows a real listing page, a real tour and its admin.
//
// Cross-tenant by design (platform code only): it reads a platform-tenant
// listing and writes into the demo tenant. What it copies, and what it won't:
// - The listing, its property, photos, floor plans, rooms, doorways, hotspots
//   and times (Before / After), with fresh ids.
// - Media rows point at the SAME Cloudinary files: nothing is uploaded. The
//   privacy flow knows a demo row borrows its file and never moves or deletes
//   it (privacy.ts).
// - Each room's photo as buyers see it, never a kept original: anyone can sign
//   in to the demo as its owner, and the privacy editor shows the original.
// - The street address stays hidden: the demo agency is fictional, so it
//   doesn't advertise a real front door.
// - No inquiries, no view counts.

/** The platform tenant's chosen listing, if BAM picked one (flags.demoSourceListingId). */
export async function demoSourceListingId(): Promise<string | null> {
  const [platform] = await db()
    .select({ flags: tenants.flags })
    .from(tenants)
    // The platform tenant that has made a choice: a platform-flagged tenant
    // without one (a test fixture, say) can never stand in for BAM's.
    .where(sql`(${tenants.flags} ->> 'platform')::boolean is true and (${tenants.flags} ->> 'demoSourceListingId') is not null`)
    .orderBy(asc(tenants.createdAt))
    .limit(1);
  return platform?.flags.demoSourceListingId ?? null;
}

export const DEMO_SLUG_SUFFIX = "-demo";

export async function cloneListingInto(
  sourceListingId: string,
  targetTenantId: string,
  opts: { agentUserId: string | null },
): Promise<Result<{ listingId: string; slug: string; rooms: number }>> {
  const [source] = await db()
    .select({ listing: listings, platform: sql<boolean>`coalesce((${tenants.flags} ->> 'platform')::boolean, false)` })
    .from(listings)
    .innerJoin(tenants, eq(tenants.id, listings.tenantId))
    .where(eq(listings.id, sourceListingId))
    .limit(1);
  if (!source || !source.platform) return err("DEMO_SOURCE", "The demo copies one of RealEstate.WitUS's own listings only.");
  if (!isPublicStatus(source.listing.status)) {
    return err("DEMO_SOURCE_DRAFT", "The demo copies a live listing only. Publish it first.");
  }
  const from = source.listing;
  const agent = opts.agentUserId
    ? (await db().select({ id: users.id }).from(users).where(eq(users.id, opts.agentUserId)).limit(1))[0]?.id ?? null
    : null;

  return withTx(async (tx) => {
    const [property] = await tx.select().from(properties).where(eq(properties.id, from.propertyId)).limit(1);
    const [photos, scenes, plans, moments] = await Promise.all([
      tx.select().from(listingPhotos).where(eq(listingPhotos.listingId, from.id)),
      tx.select().from(tourScenes).where(eq(tourScenes.listingId, from.id)),
      tx.select().from(tourFloorPlans).where(eq(tourFloorPlans.listingId, from.id)),
      tx.select().from(tourMoments).where(eq(tourMoments.listingId, from.id)),
    ]);
    const sceneIds = scenes.map((s) => s.id);
    const [momentPhotos, links, hotspots] = sceneIds.length
      ? await Promise.all([
          tx.select().from(sceneMomentPanoramas).where(inArray(sceneMomentPanoramas.sceneId, sceneIds)),
          tx.select().from(sceneLinks).where(inArray(sceneLinks.fromSceneId, sceneIds)),
          tx.select().from(sceneHotspots).where(inArray(sceneHotspots.sceneId, sceneIds)),
        ])
      : [[], [], []];

    // What buyers see, and nothing kept behind it.
    const shown = new Set<string>([
      ...photos.map((p) => p.mediaId),
      ...scenes.flatMap((s) => [s.panoramaMediaId, ...(s.posterMediaId ? [s.posterMediaId] : [])]),
      ...plans.map((p) => p.mediaId),
      ...momentPhotos.map((p) => p.mediaId),
    ]);
    const media = shown.size ? await tx.select().from(mediaAssets).where(inArray(mediaAssets.id, [...shown])) : [];
    const mediaId = new Map(media.map((m) => [m.id, randomUUID()]));
    const now = new Date();
    if (media.length) {
      await tx.insert(mediaAssets).values(
        media.map((m) => ({ ...m, id: mediaId.get(m.id)!, tenantId: targetTenantId, createdAt: now, updatedAt: now })),
      );
    }

    const propertyId = randomUUID();
    await tx.insert(properties).values({ ...property, id: propertyId, tenantId: targetTenantId, createdAt: now, updatedAt: now });
    const listingId = randomUUID();
    const slug = `${from.slug}${DEMO_SLUG_SUFFIX}`;
    await tx.insert(listings).values({
      ...from,
      id: listingId,
      tenantId: targetTenantId,
      propertyId,
      // Buildings and units aren't copied (plans/05 has no admin for them yet).
      buildingId: null,
      unitId: null,
      slug,
      agentUserId: agent,
      hideAddress: true,
      createdAt: now,
      updatedAt: now,
    });
    if (photos.length) {
      await tx.insert(listingPhotos).values(
        photos.map((p) => ({ ...p, id: randomUUID(), tenantId: targetTenantId, listingId, mediaId: mediaId.get(p.mediaId)! })),
      );
    }

    const planId = new Map(plans.map((p) => [p.id, randomUUID()]));
    if (plans.length) {
      await tx.insert(tourFloorPlans).values(
        plans.map((p) => ({ ...p, id: planId.get(p.id)!, tenantId: targetTenantId, listingId, mediaId: mediaId.get(p.mediaId)! })),
      );
    }
    const momentId = new Map(moments.map((m) => [m.id, randomUUID()]));
    if (moments.length) {
      await tx.insert(tourMoments).values(
        moments.map((m) => ({ ...m, id: momentId.get(m.id)!, tenantId: targetTenantId, listingId })),
      );
    }
    const sceneId = new Map(scenes.map((s) => [s.id, randomUUID()]));
    if (scenes.length) {
      await tx.insert(tourScenes).values(
        scenes.map((s) => ({
          ...s,
          id: sceneId.get(s.id)!,
          tenantId: targetTenantId,
          listingId,
          panoramaMediaId: mediaId.get(s.panoramaMediaId)!,
          posterMediaId: s.posterMediaId ? (mediaId.get(s.posterMediaId) ?? null) : null,
          originalPanoramaMediaId: null,
          privacyRecipe: null,
          floorPlanId: s.floorPlanId ? (planId.get(s.floorPlanId) ?? null) : null,
        })),
      );
    }
    if (momentPhotos.length) {
      await tx.insert(sceneMomentPanoramas).values(
        momentPhotos.map((p) => ({
          ...p,
          id: randomUUID(),
          tenantId: targetTenantId,
          sceneId: sceneId.get(p.sceneId)!,
          momentId: momentId.get(p.momentId)!,
          mediaId: mediaId.get(p.mediaId)!,
          originalMediaId: null,
          privacyRecipe: null,
        })),
      );
    }
    if (links.length) {
      await tx.insert(sceneLinks).values(
        links.map((l) => ({
          ...l,
          id: randomUUID(),
          tenantId: targetTenantId,
          fromSceneId: sceneId.get(l.fromSceneId)!,
          toSceneId: sceneId.get(l.toSceneId)!,
        })),
      );
    }
    if (hotspots.length) {
      await tx.insert(sceneHotspots).values(
        hotspots.map((h) => ({
          ...h,
          id: randomUUID(),
          tenantId: targetTenantId,
          sceneId: sceneId.get(h.sceneId)!,
          momentId: h.momentId ? (momentId.get(h.momentId) ?? null) : null,
        })),
      );
    }
    return ok({ listingId, slug, rooms: scenes.length });
  });
}

/** True when another tenant's media row points at this Cloudinary file (the demo's borrowed copies). */
export async function fileSharedWithAnotherTenant(tenantId: string, publicId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.cloudinaryPublicId, publicId), sql`${mediaAssets.tenantId} <> ${tenantId}`))
    .limit(1);
  return Boolean(row);
}

/** Picks (or, with null, clears) the listing the demo copies. Platform tenant only; the caller checks. */
export async function setDemoSource(platformTenantId: string, listingId: string | null): Promise<void> {
  await db()
    .update(tenants)
    .set({
      flags: listingId
        ? sql`${tenants.flags} || jsonb_build_object('demoSourceListingId', ${listingId}::text)`
        : sql`${tenants.flags} - 'demoSourceListingId'`,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, platformTenantId));
}
