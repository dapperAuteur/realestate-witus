import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  listingPhotos,
  listings,
  listingViews,
  mediaAssets,
  properties,
  sceneHotspots,
  sceneLinks,
  sceneMomentPanoramas,
  tenantMemberships,
  tourFloorPlans,
  tourMoments,
  tourScenes,
  users,
} from "@/db/schema";
import type { VirtualTour } from "@/components/tour/types";
import { deliveryUrl, limitedUrl } from "@/lib/media/cloudinary";
import { buildTour, type MediaInfo, type TourUrlBuilders } from "@/lib/tour/build-tour";
import { isPublicStatus, type ListingStatus } from "./format";

// Listing reads for the public page, the embed and the agency home. Every
// query filters by tenant as well as by id or slug: a slug is global, but a
// listing only ever renders on its own agency's hosts.

export type ListingRow = typeof listings.$inferSelect;
export type PropertyRow = typeof properties.$inferSelect;

export interface ListingPhoto {
  id: string;
  /** Up to 1600px wide, for the hero and the gallery. */
  url: string;
  /** Up to 640px wide, for mosaic tiles and the strip. */
  thumbUrl: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface ListingAgent {
  name: string | null;
  image: string | null;
  email: string;
}

export interface ListingPageData {
  listing: ListingRow;
  property: PropertyRow;
  photos: ListingPhoto[];
  /** Who buyers see and who inquiries go to. The listing's agent, else the agency's first owner. */
  agent: ListingAgent | null;
  tour: VirtualTour | null;
}

/** Panoramas capped for phones; floor plans never upscaled (pins use delivered pixels). */
export const tourUrlBuilders: TourUrlBuilders = {
  panorama: (publicId) => limitedUrl(publicId, 6144),
  thumbnail: (publicId) => limitedUrl(publicId, 480),
  floorPlan: (publicId, intrinsicWidth) => {
    const url = limitedUrl(publicId, 1600);
    return url ? { url, width: Math.min(intrinsicWidth, 1600) } : null;
  },
};

/** The listing by slug, on this tenant only. Private statuses only for staff previews. */
export async function findListing(
  tenantId: string,
  slug: string,
  opts: { staffPreview?: boolean } = {},
): Promise<ListingRow | null> {
  const [row] = await db()
    .select()
    .from(listings)
    .where(and(eq(listings.tenantId, tenantId), eq(listings.slug, slug)))
    .limit(1);
  if (!row) return null;
  if (!opts.staffPreview && !isPublicStatus(row.status as ListingStatus)) return null;
  return row;
}

export async function getListingPage(
  tenantId: string,
  slug: string,
  opts: { staffPreview?: boolean; requestedSceneId?: string | null } = {},
): Promise<ListingPageData | null> {
  const listing = await findListing(tenantId, slug, opts);
  if (!listing) return null;

  const [[property], photos, agent, tour] = await Promise.all([
    db()
      .select()
      .from(properties)
      .where(and(eq(properties.tenantId, tenantId), eq(properties.id, listing.propertyId)))
      .limit(1),
    loadPhotos(tenantId, listing.id),
    loadAgent(tenantId, listing.agentUserId),
    loadListingTour(listing, {
      includeUnpublished: Boolean(opts.staffPreview),
      requestedSceneId: opts.requestedSceneId,
    }),
  ]);
  if (!property) return null;
  return { listing, property, photos, agent, tour };
}

async function loadPhotos(tenantId: string, listingId: string): Promise<ListingPhoto[]> {
  const rows = await db()
    .select({
      id: listingPhotos.id,
      publicId: mediaAssets.cloudinaryPublicId,
      status: mediaAssets.status,
      alt: mediaAssets.altText,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(listingPhotos)
    .innerJoin(mediaAssets, eq(mediaAssets.id, listingPhotos.mediaId))
    .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.listingId, listingId)))
    .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.createdAt));
  const photos: ListingPhoto[] = [];
  for (const row of rows) {
    if (row.status !== "ready") continue;
    const url = deliveryUrl(row.publicId, { width: 1600 });
    const thumbUrl = deliveryUrl(row.publicId, { width: 640 });
    if (!url || !thumbUrl) continue;
    photos.push({ id: row.id, url, thumbUrl, alt: row.alt ?? "", width: row.width, height: row.height });
  }
  return photos;
}

/** The listing's agent, or the agency's first owner when none is set or the agent left. */
export async function loadAgent(tenantId: string, agentUserId: string | null): Promise<ListingAgent | null> {
  if (agentUserId) {
    const [agent] = await db()
      .select({ name: users.name, image: users.image, email: users.email })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, agentUserId)))
      .limit(1);
    if (agent) return agent;
  }
  const [owner] = await db()
    .select({ name: users.name, image: users.image, email: users.email })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.role, "owner")))
    .orderBy(asc(tenantMemberships.createdAt))
    .limit(1);
  return owner ?? null;
}

/** The listing's tour for the viewer, or null when it has no showable rooms yet. */
export async function loadListingTour(
  listing: Pick<ListingRow, "id" | "tenantId" | "slug" | "title" | "tourLinks">,
  opts: { includeUnpublished?: boolean; requestedSceneId?: string | null } = {},
): Promise<VirtualTour | null> {
  const tenantId = listing.tenantId;
  const scenes = await db()
    .select()
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, listing.id)))
    .orderBy(asc(tourScenes.createdAt));
  if (scenes.length === 0) return null;
  const sceneIds = scenes.map((scene) => scene.id);

  const [links, hotspots, moments, momentPhotos, floorPlans] = await Promise.all([
    db()
      .select()
      .from(sceneLinks)
      .where(and(eq(sceneLinks.tenantId, tenantId), inArray(sceneLinks.fromSceneId, sceneIds))),
    db()
      .select()
      .from(sceneHotspots)
      .where(and(eq(sceneHotspots.tenantId, tenantId), inArray(sceneHotspots.sceneId, sceneIds))),
    db()
      .select()
      .from(tourMoments)
      .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.listingId, listing.id))),
    db()
      .select()
      .from(sceneMomentPanoramas)
      .where(and(eq(sceneMomentPanoramas.tenantId, tenantId), inArray(sceneMomentPanoramas.sceneId, sceneIds))),
    db()
      .select()
      .from(tourFloorPlans)
      .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.listingId, listing.id))),
  ]);

  const mediaIds = new Set<string>();
  for (const scene of scenes) {
    mediaIds.add(scene.panoramaMediaId);
    if (scene.posterMediaId) mediaIds.add(scene.posterMediaId);
  }
  for (const photo of momentPhotos) mediaIds.add(photo.mediaId);
  for (const plan of floorPlans) mediaIds.add(plan.mediaId);
  const mediaRows = mediaIds.size
    ? await db()
        .select({
          id: mediaAssets.id,
          publicId: mediaAssets.cloudinaryPublicId,
          kind: mediaAssets.kind,
          status: mediaAssets.status,
          width: mediaAssets.width,
          height: mediaAssets.height,
        })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.tenantId, tenantId), inArray(mediaAssets.id, [...mediaIds])))
    : [];
  const media = new Map<string, MediaInfo>(mediaRows.map((row) => [row.id, row]));

  const result = buildTour({
    slug: listing.slug,
    title: listing.title,
    tourLinks: listing.tourLinks,
    scenes,
    links,
    hotspots,
    moments,
    momentPhotos,
    floorPlans,
    media,
    urls: tourUrlBuilders,
    includeUnpublished: opts.includeUnpublished,
    requestedSceneId: opts.requestedSceneId,
  });
  return result.ok ? result.tour : null;
}

export interface ListingCard {
  slug: string;
  title: string;
  status: ListingStatus;
  priceMinor: number | null;
  currency: string;
  facts: ListingRow["facts"];
  hideAddress: boolean;
  property: Pick<
    PropertyRow,
    "kind" | "addressLine1" | "addressLine2" | "neighborhood" | "locality" | "region" | "postalCode"
  >;
  heroUrl: string | null;
  heroAlt: string;
  hasTour: boolean;
}

/** The agency's public listings, newest first, for its home page grid. */
export async function listPublicListings(tenantId: string): Promise<ListingCard[]> {
  const rows = await db()
    .select({ listing: listings, property: properties })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(
      and(eq(listings.tenantId, tenantId), inArray(listings.status, ["for_sale", "under_offer", "sold"])),
    )
    .orderBy(sql`${listings.publishedAt} desc nulls last`, sql`${listings.createdAt} desc`);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.listing.id);

  const [photoRows, tourRows] = await Promise.all([
    db()
      .select({
        listingId: listingPhotos.listingId,
        publicId: mediaAssets.cloudinaryPublicId,
        alt: mediaAssets.altText,
        status: mediaAssets.status,
      })
      .from(listingPhotos)
      .innerJoin(mediaAssets, eq(mediaAssets.id, listingPhotos.mediaId))
      .where(and(eq(listingPhotos.tenantId, tenantId), inArray(listingPhotos.listingId, ids)))
      .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.createdAt)),
    db()
      .select({ listingId: tourScenes.listingId })
      .from(tourScenes)
      .where(
        and(
          eq(tourScenes.tenantId, tenantId),
          inArray(tourScenes.listingId, ids),
          eq(tourScenes.status, "published"),
        ),
      ),
  ]);
  const heroByListing = new Map<string, { url: string | null; alt: string }>();
  for (const photo of photoRows) {
    if (photo.status !== "ready" || heroByListing.has(photo.listingId)) continue;
    heroByListing.set(photo.listingId, { url: deliveryUrl(photo.publicId, { width: 800 }), alt: photo.alt ?? "" });
  }
  const withTour = new Set(tourRows.map((row) => row.listingId));

  return rows.map(({ listing, property }) => ({
    slug: listing.slug,
    title: listing.title,
    status: listing.status as ListingStatus,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    facts: listing.facts,
    hideAddress: listing.hideAddress,
    property,
    heroUrl: heroByListing.get(listing.id)?.url ?? null,
    heroAlt: heroByListing.get(listing.id)?.alt ?? "",
    hasTour: withTour.has(listing.id),
  }));
}

/**
 * Counts a page view or a tour opening (plans/08 section 7). One row per
 * listing per day per surface, incremented in a single statement, so it is
 * atomic on the neon-http driver without a transaction.
 */
export async function recordListingView(input: {
  tenantId: string;
  listingId: string;
  surface: "page" | "embed";
  event: "page" | "tour";
  day: string;
}): Promise<void> {
  const page = input.event === "page" ? 1 : 0;
  const tour = input.event === "tour" ? 1 : 0;
  await db()
    .insert(listingViews)
    .values({
      tenantId: input.tenantId,
      listingId: input.listingId,
      day: input.day,
      surface: input.surface,
      pageViews: page,
      tourOpens: tour,
    })
    .onConflictDoUpdate({
      target: [listingViews.listingId, listingViews.day, listingViews.surface],
      set: {
        pageViews: sql`${listingViews.pageViews} + ${page}`,
        tourOpens: sql`${listingViews.tourOpens} + ${tour}`,
      },
    });
}
