import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, sceneMomentPanoramas, tourFloorPlans, tourScenes } from "@/db/schema";
import { getListingPage, type ListingPageData } from "./queries";

// What the product landing may show as real (plans/08 6.5): "a capability
// appears as a benefit only once it works on a real listing", and the real
// tour and embed replace the mock-ups once BAM has a live listing to show.
// Everything here reads BAM's own listings on the platform tenant, live ones
// only, and returns nothing (so the page keeps its mock-ups) when there are
// none or the database is down.

const LIVE = ["for_sale", "under_offer", "sold"] as const;

export interface LandingCapabilities {
  /** A live listing with a published tour: the listing page, its sticky Request a tour, the seller report. */
  live: boolean;
  floorPlans: boolean;
  /** A published room whose photo had people or gear hidden. */
  privacy: boolean;
  /** Before / After: a published room with a photo for another time. */
  moments: boolean;
}

export interface LandingProof {
  /** The listing to show in the hero and the embed: BAM's demo pick if it's live, else his newest toured one. */
  listing: ListingPageData | null;
  capabilities: LandingCapabilities;
}

const NONE: LandingProof = { listing: null, capabilities: { live: false, floorPlans: false, privacy: false, moments: false } };

export async function landingProof(platformTenantId: string, demoSourceListingId: string | null): Promise<LandingProof> {
  // Live listings with at least one published room, newest first.
  const toured = await db()
    .select({ id: listings.id, slug: listings.slug })
    .from(listings)
    .where(
      and(
        eq(listings.tenantId, platformTenantId),
        inArray(listings.status, [...LIVE]),
        sql`exists (select 1 from ${tourScenes} where ${tourScenes.listingId} = ${listings.id} and ${tourScenes.status} = 'published')`,
      ),
    )
    .orderBy(desc(listings.publishedAt), desc(listings.createdAt));
  if (toured.length === 0) return NONE;
  const ids = toured.map((row) => row.id);
  const pick = toured.find((row) => row.id === demoSourceListingId) ?? toured[0];
  const pickSlug = pick.slug;

  const published = and(
    eq(tourScenes.tenantId, platformTenantId),
    inArray(tourScenes.listingId, ids),
    eq(tourScenes.status, "published"),
  );
  const [listing, [plans], [privacy], [moments]] = await Promise.all([
    getListingPage(platformTenantId, pickSlug, { platformTenant: true }),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(tourFloorPlans)
      .innerJoin(tourScenes, eq(tourScenes.floorPlanId, tourFloorPlans.id))
      .where(published),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(tourScenes)
      .where(and(published, isNotNull(tourScenes.originalPanoramaMediaId))),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(sceneMomentPanoramas)
      .innerJoin(tourScenes, eq(tourScenes.id, sceneMomentPanoramas.sceneId))
      .where(published),
  ]);
  return {
    listing,
    capabilities: { live: true, floorPlans: plans.n > 0, privacy: privacy.n > 0, moments: moments.n > 0 },
  };
}
