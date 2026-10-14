import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, withTx } from "@/db";
import {
  mediaAssets,
  sceneHotspots,
  sceneLinks,
  sceneMomentPanoramas,
  tourFloorPlans,
  tourMoments,
  tourScenes,
} from "@/db/schema";
import { findOwnedListing, ownedReadyMedia } from "@/lib/listings/admin";
import { limitedUrl } from "@/lib/media/cloudinary";
import { err, ok, type Result } from "@/lib/result";
import { tourUrlBuilders } from "@/lib/listings/queries";
import { rotateArrow } from "./arrow-rotation";
import { normalizeHeadingOffset, sortMoments } from "./moments/moments";
import { parseHttpUrl } from "./http-url";
import { planBulkSceneStatus, type SceneStatus } from "./scene-status";
import { analyzeTourGraph, layoutTourGraph, type SceneGraphStats } from "./tour-graph";
import { sceneNameFromFile } from "./tour-input";

// The tour editor's writes (plans/08 phase D: bulk scene creation, the
// Connections editor, click-to-place arrows and hotspots, floor-plan pins,
// bulk publish). Tenant id always comes from the server-side staff context;
// every query filters by it, and every cross-reference (a link's two rooms, a
// pin's floor) is checked to belong to the same listing.

type SceneRow = typeof tourScenes.$inferSelect;

async function ownedScene(tenantId: string, sceneId: string): Promise<SceneRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sceneId)) return null;
  const [row] = await db()
    .select()
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, sceneId)))
    .limit(1);
  return row ?? null;
}

const NOT_FOUND = err("SCENE_NOT_FOUND", "That room isn't in this listing.");

export interface EditorScene {
  id: string;
  name: string;
  caption: string | null;
  status: SceneStatus;
  isStart: boolean;
  orderIndex: number | null;
  panoramaUrl: string | null;
  thumbUrl: string | null;
  startYaw: number | null;
  startPitch: number | null;
  rollOffsetDeg: number | null;
  minPitchDeg: number | null;
  floorPlanId: string | null;
  mapX: number | null;
  mapY: number | null;
  stats: SceneGraphStats;
}

export interface EditorLink {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  name: string | null;
  yaw: number | null;
  pitch: number | null;
  arrivalYaw: number | null;
  arrivalPitch: number | null;
  arrowRotation: number;
}

export interface EditorFloorPlan {
  id: string;
  label: string;
  sortOrder: number;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface EditorMomentPhoto {
  sceneId: string;
  momentId: string;
  headingOffsetDeg: number;
  thumbUrl: string | null;
}

export interface TourEditData {
  scenes: EditorScene[];
  links: EditorLink[];
  hotspots: (typeof sceneHotspots.$inferSelect)[];
  floorPlans: EditorFloorPlan[];
  /** In timeline order, base included. */
  moments: (typeof tourMoments.$inferSelect)[];
  momentPhotos: EditorMomentPhoto[];
}

export async function tourEditData(tenantId: string, listingId: string): Promise<TourEditData | null> {
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return null;
  const scenes = await db()
    .select({ scene: tourScenes, publicId: mediaAssets.cloudinaryPublicId })
    .from(tourScenes)
    .innerJoin(mediaAssets, eq(mediaAssets.id, tourScenes.panoramaMediaId))
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, listingId)))
    .orderBy(sql`${tourScenes.orderIndex} asc nulls last`, asc(tourScenes.createdAt));
  const sceneIds = scenes.map((row) => row.scene.id);
  const [links, hotspots, plans, moments] = await Promise.all([
    sceneIds.length
      ? db()
          .select()
          .from(sceneLinks)
          .where(and(eq(sceneLinks.tenantId, tenantId), inArray(sceneLinks.fromSceneId, sceneIds)))
          .orderBy(asc(sceneLinks.createdAt))
      : Promise.resolve([]),
    sceneIds.length
      ? db()
          .select()
          .from(sceneHotspots)
          .where(and(eq(sceneHotspots.tenantId, tenantId), inArray(sceneHotspots.sceneId, sceneIds)))
          .orderBy(asc(sceneHotspots.createdAt))
      : Promise.resolve([]),
    db()
      .select({ plan: tourFloorPlans, publicId: mediaAssets.cloudinaryPublicId, width: mediaAssets.width, height: mediaAssets.height })
      .from(tourFloorPlans)
      .innerJoin(mediaAssets, eq(mediaAssets.id, tourFloorPlans.mediaId))
      .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.listingId, listingId)))
      .orderBy(asc(tourFloorPlans.sortOrder), asc(tourFloorPlans.createdAt)),
    db()
      .select()
      .from(tourMoments)
      .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.listingId, listingId)))
      .orderBy(asc(tourMoments.sortOrder)),
  ]);
  const momentPhotos = sceneIds.length
    ? await db()
        .select({
          sceneId: sceneMomentPanoramas.sceneId,
          momentId: sceneMomentPanoramas.momentId,
          headingOffsetDeg: sceneMomentPanoramas.headingOffsetDeg,
          publicId: mediaAssets.cloudinaryPublicId,
        })
        .from(sceneMomentPanoramas)
        .innerJoin(mediaAssets, eq(mediaAssets.id, sceneMomentPanoramas.mediaId))
        .where(and(eq(sceneMomentPanoramas.tenantId, tenantId), inArray(sceneMomentPanoramas.sceneId, sceneIds)))
    : [];

  const start = scenes.find((row) => row.scene.isStart)?.scene.id ?? scenes[0]?.scene.id ?? null;
  const stats = analyzeTourGraph({
    sceneIds,
    links: links.map((link) => ({
      fromSceneId: link.fromSceneId,
      toSceneId: link.toSceneId,
      placed: link.yaw !== null && link.pitch !== null,
    })),
    startSceneId: start,
  });

  return {
    scenes: scenes.map(({ scene, publicId }) => ({
      id: scene.id,
      name: scene.name,
      caption: scene.caption,
      status: scene.status,
      isStart: scene.id === start,
      orderIndex: scene.orderIndex,
      panoramaUrl: tourUrlBuilders.panorama(publicId),
      thumbUrl: limitedUrl(publicId, 320),
      startYaw: scene.startYaw,
      startPitch: scene.startPitch,
      rollOffsetDeg: scene.rollOffsetDeg,
      minPitchDeg: scene.minPitchDeg,
      floorPlanId: scene.floorPlanId,
      mapX: scene.mapX,
      mapY: scene.mapY,
      stats: stats.get(scene.id)!,
    })),
    links: links.map((link) => ({
      id: link.id,
      fromSceneId: link.fromSceneId,
      toSceneId: link.toSceneId,
      name: link.name,
      yaw: link.yaw,
      pitch: link.pitch,
      arrivalYaw: link.arrivalYaw,
      arrivalPitch: link.arrivalPitch,
      arrowRotation: link.arrowRotation,
    })),
    hotspots,
    floorPlans: plans.map(({ plan, publicId, width, height }) => {
      const delivered = width ? tourUrlBuilders.floorPlan(publicId, width) : null;
      return {
        id: plan.id,
        label: plan.label,
        sortOrder: plan.sortOrder,
        imageUrl: delivered?.url ?? null,
        width: delivered?.width ?? null,
        height: delivered && width && height ? Math.round((height * delivered.width) / width) : null,
      };
    }),
    moments: sortMoments(moments.map((m) => ({ ...m, occurredOn: m.occurredOn ?? null }))),
    momentPhotos: momentPhotos.map((photo) => ({
      sceneId: photo.sceneId,
      momentId: photo.momentId,
      headingOffsetDeg: photo.headingOffsetDeg,
      thumbUrl: limitedUrl(photo.publicId, 320),
    })),
  };
}

/** One draft room per uploaded panorama. The listing's first room becomes its start. */
export async function createScenes(
  tenantId: string,
  listingId: string,
  items: { mediaId: string; filename: string }[],
): Promise<Result<{ created: number }>> {
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const owned = await ownedReadyMedia(tenantId, items.map((item) => item.mediaId), "panorama");
  const usable = items.filter((item) => owned.has(item.mediaId));
  if (usable.length === 0) return err("NO_PANORAMAS", "None of those uploads is a ready 360 photo.");
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, listingId)));
  // One statement gives every row the same now(); a millisecond apart keeps
  // the upload order as the tie-breaker everywhere rooms sort by creation.
  const now = Date.now();
  await db()
    .insert(tourScenes)
    .values(
      usable.map((item, i) => ({
        tenantId,
        listingId,
        name: sceneNameFromFile(item.filename, count + i),
        panoramaMediaId: item.mediaId,
        isStart: count === 0 && i === 0,
        createdAt: new Date(now + i),
        updatedAt: new Date(now + i),
      })),
    );
  return ok({ created: usable.length });
}

export async function updateScene(
  tenantId: string,
  sceneId: string,
  patch: Partial<{
    name: string;
    caption: string | null;
    startYaw: number | null;
    startPitch: number | null;
    rollOffsetDeg: number | null;
    minPitchDeg: number | null;
    orderIndex: number | null;
  }>,
): Promise<Result<{ saved: true }>> {
  const scene = await ownedScene(tenantId, sceneId);
  if (!scene) return NOT_FOUND;
  if (patch.name !== undefined && (patch.name.trim().length < 1 || patch.name.trim().length > 80)) {
    return err("SCENE_NAME", "Room names need 1 to 80 characters.");
  }
  await db()
    .update(tourScenes)
    .set({
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption?.trim().slice(0, 200) || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, sceneId)));
  return ok({ saved: true });
}

/** The room the tour opens in. One per listing (partial unique index), so clear then set, together. */
export async function setStartScene(tenantId: string, sceneId: string): Promise<Result<{ saved: true }>> {
  const scene = await ownedScene(tenantId, sceneId);
  if (!scene) return NOT_FOUND;
  await withTx(async (tx) => {
    await tx
      .update(tourScenes)
      .set({ isStart: false })
      .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, scene.listingId), eq(tourScenes.isStart, true)));
    await tx
      .update(tourScenes)
      .set({ isStart: true, updatedAt: new Date() })
      .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, sceneId)));
  });
  return ok({ saved: true });
}

/** Bulk publish or unpublish; the rules live in scene-status.ts. */
export async function setSceneStatuses(
  tenantId: string,
  listingId: string,
  sceneIds: string[],
  target: "published" | "unpublished",
): Promise<Result<{ changed: number; unchanged: number; skipped: number }>> {
  const rows = await db()
    .select({ id: tourScenes.id, status: tourScenes.status })
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, listingId)));
  const plan = planBulkSceneStatus(
    sceneIds,
    rows.map((row) => ({ ...row, canChange: true })),
    target,
  );
  if (plan.changeIds.length) {
    const now = new Date();
    await db()
      .update(tourScenes)
      .set({ status: target, updatedAt: now, ...(target === "published" ? { publishedAt: now } : {}) })
      .where(and(eq(tourScenes.tenantId, tenantId), inArray(tourScenes.id, plan.changeIds)));
  }
  return ok({ changed: plan.changeIds.length, unchanged: plan.unchanged, skipped: plan.skipped });
}

export async function deleteScene(tenantId: string, sceneId: string): Promise<Result<{ deleted: true }>> {
  const scene = await ownedScene(tenantId, sceneId);
  if (!scene) return NOT_FOUND;
  // Links and hotspots cascade; a start scene leaves none flagged, and the tour falls back to the first room.
  await db().delete(tourScenes).where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, sceneId)));
  return ok({ deleted: true });
}

/** A doorway from one room to another (and back, when asked). Unplaced until someone clicks where it goes. */
export async function addLink(
  tenantId: string,
  fromSceneId: string,
  toSceneId: string,
  bothWays: boolean,
): Promise<Result<{ created: number }>> {
  if (fromSceneId === toSceneId) return err("LINK_SELF", "A room can't link to itself.");
  const [from, to] = await Promise.all([ownedScene(tenantId, fromSceneId), ownedScene(tenantId, toSceneId)]);
  if (!from || !to || from.listingId !== to.listingId) return err("LINK_SCENES", "Both rooms must be in this listing.");
  const existing = await db()
    .select({ from: sceneLinks.fromSceneId, to: sceneLinks.toSceneId })
    .from(sceneLinks)
    .where(
      and(
        eq(sceneLinks.tenantId, tenantId),
        inArray(sceneLinks.fromSceneId, [fromSceneId, toSceneId]),
        inArray(sceneLinks.toSceneId, [fromSceneId, toSceneId]),
      ),
    );
  const has = (a: string, b: string) => existing.some((link) => link.from === a && link.to === b);
  const wanted = [[fromSceneId, toSceneId], ...(bothWays ? [[toSceneId, fromSceneId]] : [])].filter(
    ([a, b]) => !has(a, b),
  );
  if (wanted.length) {
    const now = Date.now();
    await db()
      .insert(sceneLinks)
      .values(wanted.map(([a, b], i) => ({ tenantId, fromSceneId: a, toSceneId: b, createdAt: new Date(now + i) })));
  }
  return ok({ created: wanted.length });
}

async function ownedLink(tenantId: string, linkId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) return null;
  const [row] = await db()
    .select()
    .from(sceneLinks)
    .where(and(eq(sceneLinks.tenantId, tenantId), eq(sceneLinks.id, linkId)))
    .limit(1);
  return row ?? null;
}

export async function updateLink(
  tenantId: string,
  linkId: string,
  patch:
    | { kind: "place"; yaw: number; pitch: number }
    | { kind: "arrival"; yaw: number | null; pitch: number | null }
    | { kind: "rotate"; delta: number }
    | { kind: "name"; name: string | null },
): Promise<Result<{ saved: true }>> {
  const link = await ownedLink(tenantId, linkId);
  if (!link) return err("LINK_NOT_FOUND", "That doorway isn't in this listing.");
  const set =
    patch.kind === "place"
      ? { yaw: patch.yaw, pitch: patch.pitch }
      : patch.kind === "arrival"
        ? { arrivalYaw: patch.yaw, arrivalPitch: patch.pitch }
        : patch.kind === "rotate"
          ? { arrowRotation: rotateArrow(link.arrowRotation, patch.delta) }
          : { name: patch.name?.trim().slice(0, 80) || null };
  await db()
    .update(sceneLinks)
    .set(set)
    .where(and(eq(sceneLinks.tenantId, tenantId), eq(sceneLinks.id, linkId)));
  return ok({ saved: true });
}

export async function deleteLink(tenantId: string, linkId: string): Promise<Result<{ deleted: true }>> {
  await db().delete(sceneLinks).where(and(eq(sceneLinks.tenantId, tenantId), eq(sceneLinks.id, linkId)));
  return ok({ deleted: true });
}

export interface HotspotInput {
  yaw: number;
  pitch: number;
  title: string;
  content: string | null;
  externalUrl: string | null;
  momentId: string | null;
}

function cleanHotspot(input: HotspotInput): Result<HotspotInput> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 80) return err("HOTSPOT_TITLE", "Hotspot titles need 1 to 80 characters.");
  const content = input.content?.trim().slice(0, 1000) || null;
  let externalUrl: string | null = null;
  if (input.externalUrl?.trim()) {
    externalUrl = parseHttpUrl(input.externalUrl);
    if (!externalUrl) return err("HOTSPOT_URL", "Links must start with http:// or https://.");
  }
  return ok({ ...input, title, content, externalUrl });
}

export async function addHotspot(tenantId: string, sceneId: string, input: HotspotInput): Promise<Result<{ id: string }>> {
  const scene = await ownedScene(tenantId, sceneId);
  if (!scene) return NOT_FOUND;
  const clean = cleanHotspot(input);
  if (!clean.ok) return clean;
  const [row] = await db()
    .insert(sceneHotspots)
    .values({ tenantId, sceneId, ...clean.data })
    .returning({ id: sceneHotspots.id });
  return ok({ id: row.id });
}

export async function updateHotspot(tenantId: string, hotspotId: string, input: HotspotInput): Promise<Result<{ saved: true }>> {
  const clean = cleanHotspot(input);
  if (!clean.ok) return clean;
  await db()
    .update(sceneHotspots)
    .set({ ...clean.data, updatedAt: new Date() })
    .where(and(eq(sceneHotspots.tenantId, tenantId), eq(sceneHotspots.id, hotspotId)));
  return ok({ saved: true });
}

export async function deleteHotspot(tenantId: string, hotspotId: string): Promise<Result<{ deleted: true }>> {
  await db().delete(sceneHotspots).where(and(eq(sceneHotspots.tenantId, tenantId), eq(sceneHotspots.id, hotspotId)));
  return ok({ deleted: true });
}

export async function addFloorPlan(
  tenantId: string,
  listingId: string,
  mediaId: string,
  label: string,
): Promise<Result<{ id: string }>> {
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const clean = label.trim();
  if (clean.length < 1 || clean.length > 40) return err("FLOOR_LABEL", "Floor names need 1 to 40 characters.");
  const owned = await ownedReadyMedia(tenantId, [mediaId], "floor_plan");
  if (!owned.has(mediaId)) return err("FLOOR_MEDIA", "Upload the floor plan image first.");
  const [{ max }] = await db()
    .select({ max: sql<number>`coalesce(max(${tourFloorPlans.sortOrder}), -1)::int` })
    .from(tourFloorPlans)
    .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.listingId, listingId)));
  const [row] = await db()
    .insert(tourFloorPlans)
    .values({ tenantId, listingId, mediaId, label: clean, sortOrder: max + 1 })
    .returning({ id: tourFloorPlans.id });
  return ok({ id: row.id });
}

export async function renameFloorPlan(tenantId: string, floorPlanId: string, label: string): Promise<Result<{ saved: true }>> {
  const clean = label.trim();
  if (clean.length < 1 || clean.length > 40) return err("FLOOR_LABEL", "Floor names need 1 to 40 characters.");
  await db()
    .update(tourFloorPlans)
    .set({ label: clean, updatedAt: new Date() })
    .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.id, floorPlanId)));
  return ok({ saved: true });
}

/** Removes a floor. Its rooms lose their floor and their pins (the FK sets the floor to null; pins go too). */
export async function deleteFloorPlan(tenantId: string, floorPlanId: string): Promise<Result<{ deleted: true }>> {
  await withTx(async (tx) => {
    await tx
      .update(tourScenes)
      .set({ floorPlanId: null, mapX: null, mapY: null })
      .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.floorPlanId, floorPlanId)));
    await tx.delete(tourFloorPlans).where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.id, floorPlanId)));
  });
  return ok({ deleted: true });
}

/** Puts a room on a floor, with or without a pin. Null floor takes it off every plan. */
export async function placeSceneOnPlan(
  tenantId: string,
  sceneId: string,
  floorPlanId: string | null,
  point: { x: number; y: number } | null,
): Promise<Result<{ saved: true }>> {
  const scene = await ownedScene(tenantId, sceneId);
  if (!scene) return NOT_FOUND;
  if (floorPlanId) {
    const [plan] = await db()
      .select({ listingId: tourFloorPlans.listingId })
      .from(tourFloorPlans)
      .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.id, floorPlanId)))
      .limit(1);
    if (!plan || plan.listingId !== scene.listingId) return err("FLOOR_NOT_FOUND", "That floor isn't in this listing.");
  }
  await db()
    .update(tourScenes)
    .set({
      floorPlanId,
      mapX: floorPlanId && point ? point.x : null,
      mapY: floorPlanId && point ? point.y : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, sceneId)));
  return ok({ saved: true });
}

/**
 * A starting arrangement for this floor's unpinned rooms (Wanderlust's
 * deterministic layout: walk depth left to right). Rooms already pinned keep
 * their place; the editor adjusts the rest by hand.
 */
export async function autoArrangeFloor(tenantId: string, floorPlanId: string): Promise<Result<{ placed: number }>> {
  const scenes = await db()
    .select({ id: tourScenes.id, mapX: tourScenes.mapX, isStart: tourScenes.isStart })
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.floorPlanId, floorPlanId)))
    .orderBy(asc(tourScenes.createdAt));
  const unpinned = scenes.filter((scene) => scene.mapX === null);
  if (unpinned.length === 0) return ok({ placed: 0 });
  const ids = scenes.map((scene) => scene.id);
  const links = await db()
    .select({ fromSceneId: sceneLinks.fromSceneId, toSceneId: sceneLinks.toSceneId })
    .from(sceneLinks)
    .where(and(eq(sceneLinks.tenantId, tenantId), inArray(sceneLinks.fromSceneId, ids)));
  const layout = layoutTourGraph({
    sceneIds: ids,
    links: links.map((link) => ({ ...link, placed: true })),
    startSceneId: scenes.find((scene) => scene.isStart)?.id ?? ids[0],
  });
  await withTx(async (tx) => {
    for (const scene of unpinned) {
      const point = layout.get(scene.id);
      if (!point) continue;
      await tx
        .update(tourScenes)
        .set({ mapX: point.x, mapY: point.y })
        .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, scene.id), isNull(tourScenes.mapX)));
    }
  });
  return ok({ placed: unpinned.length });
}

// ── Ownership resolvers ──────────────────────────────────────────────────────
// The action layer checks edit rights on the listing an entity REALLY belongs
// to, resolved here, never on a listing id the request claims. An agent with
// rights on listing A can't reach a hotspot of listing B by sending A's id.

const UUID = /^[0-9a-f-]{36}$/i;

export async function listingIdForScene(tenantId: string, sceneId: string): Promise<string | null> {
  return (await ownedScene(tenantId, sceneId))?.listingId ?? null;
}

export async function listingIdForLink(tenantId: string, linkId: string): Promise<string | null> {
  const link = await ownedLink(tenantId, linkId);
  return link ? listingIdForScene(tenantId, link.fromSceneId) : null;
}

export async function listingIdForHotspot(tenantId: string, hotspotId: string): Promise<string | null> {
  if (!UUID.test(hotspotId)) return null;
  const [row] = await db()
    .select({ listingId: tourScenes.listingId })
    .from(sceneHotspots)
    .innerJoin(tourScenes, eq(tourScenes.id, sceneHotspots.sceneId))
    .where(and(eq(sceneHotspots.tenantId, tenantId), eq(sceneHotspots.id, hotspotId)))
    .limit(1);
  return row?.listingId ?? null;
}

export async function listingIdForFloorPlan(tenantId: string, floorPlanId: string): Promise<string | null> {
  if (!UUID.test(floorPlanId)) return null;
  const [row] = await db()
    .select({ listingId: tourFloorPlans.listingId })
    .from(tourFloorPlans)
    .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.id, floorPlanId)))
    .limit(1);
  return row?.listingId ?? null;
}

// ── Moments: Before / After (plans/08 phase E) ───────────────────────────────
// The timeline belongs to the listing's tour. The base row is the rooms' own
// photos ("After" in a renovation); every other moment adds a second photo
// per room. Labels are free text with presets (decision D2).

export async function listingIdForMoment(tenantId: string, momentId: string): Promise<string | null> {
  if (!UUID.test(momentId)) return null;
  const [row] = await db()
    .select({ listingId: tourMoments.listingId })
    .from(tourMoments)
    .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.id, momentId)))
    .limit(1);
  return row?.listingId ?? null;
}

function cleanMomentLabel(label: string): string | null {
  const clean = label.trim();
  return clean.length >= 1 && clean.length <= 40 ? clean : null;
}

/**
 * Adds a time to the tour. The first one also creates the base row, labeled
 * for what the current photos show. `placement` puts the new time before or
 * after everything already on the timeline.
 */
export async function addMoment(
  tenantId: string,
  listingId: string,
  input: { label: string; baseLabel?: string; placement: "earlier" | "later" },
): Promise<Result<{ id: string }>> {
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const label = cleanMomentLabel(input.label);
  if (!label) return err("MOMENT_LABEL", "Moment names need 1 to 40 characters.");
  const existing = await db()
    .select()
    .from(tourMoments)
    .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.listingId, listingId)));
  let baseLabel: string | null = null;
  if (!existing.some((m) => m.isBase)) {
    baseLabel = cleanMomentLabel(input.baseLabel ?? "Now");
    if (!baseLabel) return err("MOMENT_LABEL", "Moment names need 1 to 40 characters.");
  }
  const orders = existing.map((m) => m.sortOrder);
  const sortOrder =
    input.placement === "earlier" ? Math.min(0, ...orders) - 1 : Math.max(baseLabel ? 0 : -1, ...orders) + 1;
  const id = await withTx(async (tx) => {
    if (baseLabel) {
      await tx.insert(tourMoments).values({ tenantId, listingId, label: baseLabel, isBase: true, sortOrder: 0 });
    }
    const [row] = await tx
      .insert(tourMoments)
      .values({ tenantId, listingId, label, isBase: false, sortOrder })
      .returning({ id: tourMoments.id });
    return row.id;
  });
  return ok({ id });
}

export async function renameMoment(tenantId: string, momentId: string, label: string): Promise<Result<{ saved: true }>> {
  const clean = cleanMomentLabel(label);
  if (!clean) return err("MOMENT_LABEL", "Moment names need 1 to 40 characters.");
  await db()
    .update(tourMoments)
    .set({ label: clean, updatedAt: new Date() })
    .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.id, momentId)));
  return ok({ saved: true });
}

/**
 * Removes a time and its photos (cascade); hotspots limited to it show in
 * every time again (set null). The base row can't go while other times
 * exist, and goes with the last of them: a timeline of one is no timeline.
 */
export async function deleteMoment(tenantId: string, momentId: string): Promise<Result<{ deleted: true }>> {
  const listingId = await listingIdForMoment(tenantId, momentId);
  if (!listingId) return err("MOMENT_NOT_FOUND", "That moment isn't in this listing.");
  const moments = await db()
    .select()
    .from(tourMoments)
    .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.listingId, listingId)));
  const target = moments.find((m) => m.id === momentId)!;
  if (target.isBase) return err("MOMENT_BASE", "The current photos can't be removed while other times exist.");
  const others = moments.filter((m) => !m.isBase && m.id !== momentId);
  const ids = others.length ? [momentId] : moments.map((m) => m.id);
  await db().delete(tourMoments).where(and(eq(tourMoments.tenantId, tenantId), inArray(tourMoments.id, ids)));
  return ok({ deleted: true });
}

/** A room's photo for a time. Replacing it starts the heading again at zero. */
export async function setMomentPhoto(
  tenantId: string,
  sceneId: string,
  momentId: string,
  mediaId: string,
): Promise<Result<{ saved: true }>> {
  const scene = await ownedScene(tenantId, sceneId);
  if (!scene) return NOT_FOUND;
  const [moment] = await db()
    .select()
    .from(tourMoments)
    .where(and(eq(tourMoments.tenantId, tenantId), eq(tourMoments.id, momentId)))
    .limit(1);
  if (!moment || moment.listingId !== scene.listingId) return err("MOMENT_NOT_FOUND", "That moment isn't in this listing.");
  if (moment.isBase) return err("MOMENT_BASE", "The current photo is the room's own 360 photo.");
  const owned = await ownedReadyMedia(tenantId, [mediaId], "panorama");
  if (!owned.has(mediaId)) return err("NO_PANORAMAS", "Upload a 360 photo first.");
  await db()
    .insert(sceneMomentPanoramas)
    .values({ tenantId, sceneId, momentId, mediaId, headingOffsetDeg: 0 })
    .onConflictDoUpdate({
      target: [sceneMomentPanoramas.sceneId, sceneMomentPanoramas.momentId],
      set: { mediaId, headingOffsetDeg: 0, updatedAt: new Date() },
    });
  return ok({ saved: true });
}

/** How far the time's photo is turned to line up with the current one, -180..180 degrees. */
export async function setMomentHeading(
  tenantId: string,
  sceneId: string,
  momentId: string,
  degrees: number,
): Promise<Result<{ saved: true }>> {
  if (!Number.isFinite(degrees)) return err("BAD_HEADING", "The heading must be a number.");
  await db()
    .update(sceneMomentPanoramas)
    .set({ headingOffsetDeg: normalizeHeadingOffset(Math.round(degrees)), updatedAt: new Date() })
    .where(
      and(
        eq(sceneMomentPanoramas.tenantId, tenantId),
        eq(sceneMomentPanoramas.sceneId, sceneId),
        eq(sceneMomentPanoramas.momentId, momentId),
      ),
    );
  return ok({ saved: true });
}

export async function removeMomentPhoto(tenantId: string, sceneId: string, momentId: string): Promise<Result<{ deleted: true }>> {
  await db()
    .delete(sceneMomentPanoramas)
    .where(
      and(
        eq(sceneMomentPanoramas.tenantId, tenantId),
        eq(sceneMomentPanoramas.sceneId, sceneId),
        eq(sceneMomentPanoramas.momentId, momentId),
      ),
    );
  return ok({ deleted: true });
}
