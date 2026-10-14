import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, withTx } from "@/db";
import {
  listingInquiries,
  listingPhotos,
  listings,
  listingViews,
  mediaAssets,
  properties,
  tourScenes,
  type TenantRole,
} from "@/db/schema";
import { deliveryUrl } from "@/lib/media/cloudinary";
import { err, ok, type Result } from "@/lib/result";
import { roleSatisfies } from "@/lib/rbac";
import { defaultTourLinks } from "@/lib/tour/tour-links";
import type { ListingStatus } from "./format";
import { statusTimestamps, type ListingInput, type PropertyInput } from "./listing-input";
import { listingSlug, randomSlugSuffix } from "./slug";

// The admin side of listings (plans/08 phase D). Every function takes the
// tenant id from the server-side staff context, never from the request, and
// every query filters by it: a listing id from another agency simply isn't
// found.

export type ListingRow = typeof listings.$inferSelect;

/** Owners and managers edit every listing; an agent edits the ones assigned to them. */
export function canEditListing(
  ctx: { role: TenantRole; userId: string },
  listing: Pick<ListingRow, "agentUserId">,
): boolean {
  return roleSatisfies(ctx.role, "manager") || listing.agentUserId === ctx.userId;
}

export async function findOwnedListing(tenantId: string, listingId: string): Promise<ListingRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return null;
  const [row] = await db()
    .select()
    .from(listings)
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)))
    .limit(1);
  return row ?? null;
}

export interface BoardRow {
  id: string;
  slug: string;
  title: string;
  status: ListingStatus;
  addressLine1: string;
  locality: string | null;
  updatedAt: Date;
  pageViews7d: number;
  tourOpens7d: number;
  newInquiries: number;
  scenes: number;
  publishedScenes: number;
  agentUserId: string | null;
}

/** The listings board: every listing with this week's numbers. */
export async function listingsBoard(tenantId: string, now = new Date()): Promise<BoardRow[]> {
  const since = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db()
    .select({ listing: listings, property: properties })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(eq(listings.tenantId, tenantId))
    .orderBy(desc(listings.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.listing.id);
  const [views, inquiries, scenes] = await Promise.all([
    db()
      .select({
        listingId: listingViews.listingId,
        pageViews: sql<number>`sum(${listingViews.pageViews})::int`,
        tourOpens: sql<number>`sum(${listingViews.tourOpens})::int`,
      })
      .from(listingViews)
      .where(and(eq(listingViews.tenantId, tenantId), inArray(listingViews.listingId, ids), gte(listingViews.day, since)))
      .groupBy(listingViews.listingId),
    db()
      .select({ listingId: listingInquiries.listingId, count: sql<number>`count(*)::int` })
      .from(listingInquiries)
      .where(
        and(
          eq(listingInquiries.tenantId, tenantId),
          inArray(listingInquiries.listingId, ids),
          eq(listingInquiries.status, "new"),
        ),
      )
      .groupBy(listingInquiries.listingId),
    db()
      .select({
        listingId: tourScenes.listingId,
        total: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${tourScenes.status} = 'published')::int`,
      })
      .from(tourScenes)
      .where(and(eq(tourScenes.tenantId, tenantId), inArray(tourScenes.listingId, ids)))
      .groupBy(tourScenes.listingId),
  ]);
  const viewsBy = new Map(views.map((v) => [v.listingId, v]));
  const inquiriesBy = new Map(inquiries.map((i) => [i.listingId, i.count]));
  const scenesBy = new Map(scenes.map((s) => [s.listingId, s]));
  return rows.map(({ listing, property }) => ({
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    status: listing.status as ListingStatus,
    addressLine1: property.addressLine1,
    locality: property.locality,
    updatedAt: listing.updatedAt,
    pageViews7d: viewsBy.get(listing.id)?.pageViews ?? 0,
    tourOpens7d: viewsBy.get(listing.id)?.tourOpens ?? 0,
    newInquiries: inquiriesBy.get(listing.id) ?? 0,
    scenes: scenesBy.get(listing.id)?.total ?? 0,
    publishedScenes: scenesBy.get(listing.id)?.published ?? 0,
    agentUserId: listing.agentUserId,
  }));
}

export interface AdminPhoto {
  id: string;
  mediaId: string;
  thumbUrl: string | null;
  alt: string;
}

export interface ListingEditData {
  listing: ListingRow;
  property: typeof properties.$inferSelect;
  photos: AdminPhoto[];
  inquiries: (typeof listingInquiries.$inferSelect)[];
  views30d: { page: { pageViews: number; tourOpens: number }; embed: { pageViews: number; tourOpens: number } };
}

export async function listingEditData(tenantId: string, listingId: string, now = new Date()): Promise<ListingEditData | null> {
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return null;
  const since = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [[property], photoRows, inquiries, views] = await Promise.all([
    db()
      .select()
      .from(properties)
      .where(and(eq(properties.tenantId, tenantId), eq(properties.id, listing.propertyId)))
      .limit(1),
    db()
      .select({
        id: listingPhotos.id,
        mediaId: listingPhotos.mediaId,
        publicId: mediaAssets.cloudinaryPublicId,
        alt: mediaAssets.altText,
      })
      .from(listingPhotos)
      .innerJoin(mediaAssets, eq(mediaAssets.id, listingPhotos.mediaId))
      .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.listingId, listingId)))
      .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.createdAt)),
    db()
      .select()
      .from(listingInquiries)
      .where(and(eq(listingInquiries.tenantId, tenantId), eq(listingInquiries.listingId, listingId)))
      .orderBy(desc(listingInquiries.createdAt))
      .limit(25),
    db()
      .select({
        surface: listingViews.surface,
        pageViews: sql<number>`sum(${listingViews.pageViews})::int`,
        tourOpens: sql<number>`sum(${listingViews.tourOpens})::int`,
      })
      .from(listingViews)
      .where(and(eq(listingViews.tenantId, tenantId), eq(listingViews.listingId, listingId), gte(listingViews.day, since)))
      .groupBy(listingViews.surface),
  ]);
  if (!property) return null;
  const zero = { pageViews: 0, tourOpens: 0 };
  const bySurface = new Map(views.map((v) => [v.surface, { pageViews: v.pageViews ?? 0, tourOpens: v.tourOpens ?? 0 }]));
  return {
    listing,
    property,
    photos: photoRows.map((row) => ({
      id: row.id,
      mediaId: row.mediaId,
      thumbUrl: deliveryUrl(row.publicId, { width: 320 }),
      alt: row.alt ?? "",
    })),
    inquiries,
    views30d: { page: bySurface.get("page") ?? zero, embed: bySurface.get("embed") ?? zero },
  };
}

export async function createListing(input: {
  tenantId: string;
  userId: string;
  property: PropertyInput;
  listing: ListingInput;
  tourLinkLabels: { requestTour: string; contactAgent: string };
}): Promise<Result<{ id: string; slug: string }>> {
  const { tenantId } = input;
  return withTx(async (tx) => {
    const [property] = await tx
      .insert(properties)
      .values({ tenantId, ...input.property })
      .returning({ id: properties.id });
    // A clash on the random suffix is vanishingly rare; three tries, then say so.
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = listingSlug(input.listing.title, randomSlugSuffix());
      const [row] = await tx
        .insert(listings)
        .values({
          tenantId,
          propertyId: property.id,
          slug,
          title: input.listing.title,
          priceMinor: input.listing.priceMinor,
          currency: input.listing.currency,
          highlights: input.listing.highlights,
          description: input.listing.description,
          facts: input.listing.facts,
          features: input.listing.features,
          hideAddress: input.listing.hideAddress,
          theme: input.listing.galleryMode ? { galleryMode: input.listing.galleryMode } : {},
          tourLinks: defaultTourLinks(input.tourLinkLabels),
          createdBy: input.userId,
        })
        .onConflictDoNothing({ target: listings.slug })
        .returning({ id: listings.id, slug: listings.slug });
      if (row) return ok(row);
    }
    throw new Error("Could not pick a unique listing slug");
  }).catch((error) => {
    console.error("[listings] create failed", error);
    return err("LISTING_CREATE_FAILED", "The listing couldn't be saved. Try again.");
  });
}

export async function updateListing(input: {
  tenantId: string;
  listingId: string;
  property: PropertyInput;
  listing: ListingInput;
  agentUserId?: string | null;
}): Promise<Result<{ saved: true }>> {
  const current = await findOwnedListing(input.tenantId, input.listingId);
  if (!current) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const now = new Date();
  await withTx(async (tx) => {
    await tx
      .update(properties)
      .set({ ...input.property, updatedAt: now })
      .where(and(eq(properties.tenantId, input.tenantId), eq(properties.id, current.propertyId)));
    await tx
      .update(listings)
      .set({
        title: input.listing.title,
        priceMinor: input.listing.priceMinor,
        currency: input.listing.currency,
        highlights: input.listing.highlights,
        description: input.listing.description,
        facts: input.listing.facts,
        features: input.listing.features,
        hideAddress: input.listing.hideAddress,
        theme: { ...current.theme, galleryMode: input.listing.galleryMode ?? undefined },
        ...(input.agentUserId !== undefined ? { agentUserId: input.agentUserId } : {}),
        updatedAt: now,
      })
      .where(and(eq(listings.tenantId, input.tenantId), eq(listings.id, input.listingId)));
  });
  return ok({ saved: true });
}

export async function changeListingStatus(
  tenantId: string,
  listingId: string,
  status: ListingStatus,
): Promise<Result<{ status: ListingStatus }>> {
  const current = await findOwnedListing(tenantId, listingId);
  if (!current) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const now = new Date();
  await db()
    .update(listings)
    .set({ status, ...statusTimestamps(status, current, now), updatedAt: now })
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)));
  return ok({ status });
}

/** Media ids that belong to this tenant, are ready, and are of the given kind. */
export async function ownedReadyMedia(tenantId: string, mediaIds: string[], kind: string): Promise<Set<string>> {
  const ids = mediaIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return new Set();
  const rows = await db()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, tenantId),
        inArray(mediaAssets.id, ids),
        eq(mediaAssets.status, "ready"),
        sql`${mediaAssets.kind} = ${kind}`,
      ),
    );
  return new Set(rows.map((row) => row.id));
}

export async function attachPhotos(
  tenantId: string,
  listingId: string,
  mediaIds: string[],
): Promise<Result<{ added: number }>> {
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const owned = await ownedReadyMedia(tenantId, mediaIds, "photo");
  const ordered = mediaIds.filter((id) => owned.has(id));
  if (ordered.length === 0) return ok({ added: 0 });
  const [{ max }] = await db()
    .select({ max: sql<number>`coalesce(max(${listingPhotos.sortOrder}), -1)::int` })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.listingId, listingId)));
  const rows = await db()
    .insert(listingPhotos)
    .values(ordered.map((mediaId, i) => ({ tenantId, listingId, mediaId, sortOrder: max + 1 + i })))
    .onConflictDoNothing()
    .returning({ id: listingPhotos.id });
  return ok({ added: rows.length });
}

/** Alt text lives on the media row (a11y rule: meaningful, or deliberately empty). */
export async function setPhotoAlt(tenantId: string, photoId: string, alt: string): Promise<Result<{ saved: true }>> {
  const [photo] = await db()
    .select({ mediaId: listingPhotos.mediaId })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.id, photoId)))
    .limit(1);
  if (!photo) return err("PHOTO_NOT_FOUND", "That photo isn't on this listing.");
  await db()
    .update(mediaAssets)
    .set({ altText: alt.trim().slice(0, 300) })
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, photo.mediaId)));
  return ok({ saved: true });
}

/** Moves a photo one place earlier or later; the first photo is the hero. */
export async function movePhoto(
  tenantId: string,
  listingId: string,
  photoId: string,
  direction: "up" | "down",
): Promise<Result<{ moved: boolean }>> {
  return withTx(async (tx) => {
    const rows = await tx
      .select({ id: listingPhotos.id })
      .from(listingPhotos)
      .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.listingId, listingId)))
      .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.createdAt));
    const order = rows.map((row) => row.id);
    const at = order.indexOf(photoId);
    const to = direction === "up" ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= order.length) return ok({ moved: false });
    [order[at], order[to]] = [order[to], order[at]];
    // Rewrite every position: also heals gaps and ties from older edits.
    for (const [index, id] of order.entries()) {
      await tx
        .update(listingPhotos)
        .set({ sortOrder: index })
        .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.id, id)));
    }
    return ok({ moved: true });
  });
}

export async function removePhoto(tenantId: string, listingId: string, photoId: string): Promise<Result<{ removed: boolean }>> {
  const rows = await db()
    .delete(listingPhotos)
    .where(
      and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.listingId, listingId), eq(listingPhotos.id, photoId)),
    )
    .returning({ id: listingPhotos.id });
  return ok({ removed: rows.length > 0 });
}

export async function setInquiryStatus(
  tenantId: string,
  inquiryId: string,
  status: "new" | "replied" | "closed",
): Promise<Result<{ saved: true }>> {
  await db()
    .update(listingInquiries)
    .set({ status })
    .where(and(eq(listingInquiries.tenantId, tenantId), eq(listingInquiries.id, inquiryId)));
  return ok({ saved: true });
}

export async function listingIdForPhoto(tenantId: string, photoId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return null;
  const [row] = await db()
    .select({ listingId: listingPhotos.listingId })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.id, photoId)))
    .limit(1);
  return row?.listingId ?? null;
}

export async function listingIdForInquiry(tenantId: string, inquiryId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(inquiryId)) return null;
  const [row] = await db()
    .select({ listingId: listingInquiries.listingId })
    .from(listingInquiries)
    .where(and(eq(listingInquiries.tenantId, tenantId), eq(listingInquiries.id, inquiryId)))
    .limit(1);
  return row?.listingId ?? null;
}
