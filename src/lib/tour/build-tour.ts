// Ported from wanderlearn-app src/lib/assemble-tour.ts @ c7f5616, 2026-10-14
// (plans/08 phase B). Wanderlust's version queries and assembles in one
// function; here the queries live in src/lib/listings/tour-data.ts and this
// file is pure, so every rule below is unit-tested without a database.
//
// Rules kept from Wanderlust:
// - buyers see published scenes only; staff previews see every status
// - only ready media reaches the viewer (no half-uploaded panoramas)
// - only PLACED links become arrows (PSV throws on a link with no position)
// - links to scenes this visit doesn't include are dropped, so no arrow ever
//   leads to an unpublished room ("Node not found")
// - visit order: the explicit order first, then the walk from the start scene
// New: floors, and the requested room (`?scene=`) kept apart from the start
// scene, so a shared link opens on its room without reordering the tour.

import type {
  SceneHotspot,
  SceneMomentPhoto,
  TourFloorPlan,
  TourScene,
  VirtualTour,
} from "@/components/tour/types";
import { isHttpUrl } from "./http-url";
import { sortMoments } from "./moments/moments";
import { usableTourLinks, type TourLink } from "./tour-links";
import { dropLinksToMissingScenes, walkOrderFromStart } from "./tour-graph";

export interface MediaInfo {
  publicId: string;
  kind: string;
  status: string;
  width: number | null;
  height: number | null;
}

export interface SceneRow {
  id: string;
  name: string;
  caption: string | null;
  panoramaMediaId: string;
  posterMediaId: string | null;
  startYaw: number | null;
  startPitch: number | null;
  rollOffsetDeg: number | null;
  minPitchDeg: number | null;
  floorPlanId: string | null;
  mapX: number | null;
  mapY: number | null;
  orderIndex: number | null;
  isStart: boolean;
  status: "draft" | "published" | "unpublished";
}

export interface LinkRow {
  fromSceneId: string;
  toSceneId: string;
  name: string | null;
  yaw: number | null;
  pitch: number | null;
  arrivalYaw: number | null;
  arrivalPitch: number | null;
  arrowRotation: number;
}

export interface HotspotRow {
  id: string;
  sceneId: string;
  yaw: number;
  pitch: number;
  title: string;
  content: string | null;
  externalUrl: string | null;
  momentId: string | null;
}

export interface MomentRow {
  id: string;
  label: string;
  occurredOn: string | null;
  sortOrder: number;
  isBase: boolean;
}

export interface MomentPhotoRow {
  sceneId: string;
  momentId: string;
  mediaId: string;
  headingOffsetDeg: number;
}

export interface FloorPlanRow {
  id: string;
  label: string;
  sortOrder: number;
  mediaId: string;
}

/** Delivery URLs, injected so this file never imports env or Cloudinary. */
export interface TourUrlBuilders {
  /** A full panorama (capped for phones). */
  panorama(publicId: string): string | null;
  /** A small 2:1 thumbnail for the room strip. */
  thumbnail(publicId: string): string | null;
  /** A floor plan and the width it is delivered at (pins convert against delivered pixels). */
  floorPlan(publicId: string, intrinsicWidth: number): { url: string; width: number } | null;
  /** A mid-size 2:1 still, for the Before / After section. Optional. */
  preview?(publicId: string): string | null;
}

export interface BuildTourInput {
  slug: string;
  title: string;
  tourLinks: TourLink[] | null;
  /** Scene rows in creation order (the walk-order tie-breaker). */
  scenes: SceneRow[];
  links: LinkRow[];
  hotspots: HotspotRow[];
  moments: MomentRow[];
  momentPhotos: MomentPhotoRow[];
  floorPlans: FloorPlanRow[];
  media: ReadonlyMap<string, MediaInfo>;
  urls: TourUrlBuilders;
  /** Staff preview: drafts and unpublished rooms included. */
  includeUnpublished?: boolean;
  /** `?scene=`: open here if this visit includes it. Never changes the order. */
  requestedSceneId?: string | null;
}

export type BuildTourResult =
  | { ok: true; tour: VirtualTour }
  | { ok: false; code: "no_scenes" | "no_ready_media" };

const PANORAMA_KINDS = new Set(["panorama"]);

function readyMedia(media: ReadonlyMap<string, MediaInfo>, id: string | null, kinds?: Set<string>) {
  if (!id) return undefined;
  const row = media.get(id);
  if (!row || row.status !== "ready") return undefined;
  if (kinds && !kinds.has(row.kind)) return undefined;
  return row;
}

export function buildTour(input: BuildTourInput): BuildTourResult {
  const visible = input.includeUnpublished
    ? input.scenes
    : input.scenes.filter((scene) => scene.status === "published");
  if (visible.length === 0) return { ok: false, code: "no_scenes" };

  // ── Floors: ready images with known dimensions, in floor order ──────────
  const floorPlans: TourFloorPlan[] = [];
  for (const row of [...input.floorPlans].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  )) {
    const media = readyMedia(input.media, row.mediaId);
    if (!media || !media.width || !media.height) continue;
    const delivered = input.urls.floorPlan(media.publicId, media.width);
    if (!delivered) continue;
    floorPlans.push({
      id: row.id,
      label: row.label,
      imageUrl: delivered.url,
      width: delivered.width,
      // Delivery scales proportionally; pins convert against delivered pixels.
      height: Math.round((media.height * delivered.width) / media.width),
    });
  }
  const floorIds = new Set(floorPlans.map((plan) => plan.id));

  // ── Moments: the timeline, and each scene's ready photos for it ─────────
  const timeline = sortMoments(input.moments);
  const hasTimeline = timeline.some((moment) => !moment.isBase);
  const momentIds = new Set(timeline.map((moment) => moment.id));
  const photosBySceneId = new Map<string, SceneMomentPhoto[]>();
  for (const row of input.momentPhotos) {
    if (!momentIds.has(row.momentId)) continue;
    const media = readyMedia(input.media, row.mediaId, PANORAMA_KINDS);
    const panorama = media ? input.urls.panorama(media.publicId) : null;
    if (!panorama) continue;
    const list = photosBySceneId.get(row.sceneId) ?? [];
    list.push({
      momentId: row.momentId,
      panorama,
      headingOffsetDeg: row.headingOffsetDeg,
      preview: input.urls.preview?.(media!.publicId) ?? undefined,
    });
    photosBySceneId.set(row.sceneId, list);
  }

  const hotspotsBySceneId = new Map<string, SceneHotspot[]>();
  for (const row of input.hotspots) {
    const list = hotspotsBySceneId.get(row.sceneId) ?? [];
    list.push({
      id: row.id,
      position: { yaw: row.yaw, pitch: row.pitch },
      title: row.title,
      content: row.content ?? undefined,
      // Re-checked on the way out: a row edited by hand never passed the save check.
      externalUrl: row.externalUrl && isHttpUrl(row.externalUrl) ? row.externalUrl : undefined,
      momentId: row.momentId ?? undefined,
    });
    hotspotsBySceneId.set(row.sceneId, list);
  }

  let scenes: TourScene[] = [];
  for (const row of visible) {
    const media = readyMedia(input.media, row.panoramaMediaId, PANORAMA_KINDS);
    const panorama = media ? input.urls.panorama(media.publicId) : null;
    if (!media || !panorama) continue;
    const poster = readyMedia(input.media, row.posterMediaId);
    const thumbnail = input.urls.thumbnail((poster ?? media).publicId) ?? undefined;
    const onFloor = row.floorPlanId && floorIds.has(row.floorPlanId) ? row.floorPlanId : undefined;
    scenes.push({
      id: row.id,
      name: row.name,
      caption: row.caption ?? undefined,
      panorama,
      thumbnail,
      preview: input.urls.preview?.(media.publicId) ?? undefined,
      startPosition:
        row.startYaw !== null && row.startPitch !== null ? { yaw: row.startYaw, pitch: row.startPitch } : undefined,
      rollOffsetDeg: row.rollOffsetDeg ?? undefined,
      minPitchDeg: row.minPitchDeg ?? undefined,
      floorPlanId: onFloor,
      mapPosition: onFloor && row.mapX !== null && row.mapY !== null ? { x: row.mapX, y: row.mapY } : undefined,
      moments: hasTimeline ? photosBySceneId.get(row.id) : undefined,
      hotspots: hotspotsBySceneId.get(row.id) ?? [],
      // Placed links only: PSV manual mode throws on a link with no position,
      // and an unplaced link is a deliberate invisible-until-placed state.
      links: input.links
        .filter((link) => link.fromSceneId === row.id && link.yaw !== null && link.pitch !== null)
        .map((link) => ({
          nodeId: link.toSceneId,
          name: link.name ?? undefined,
          position: { yaw: link.yaw as number, pitch: link.pitch as number },
          arrivalPosition:
            link.arrivalYaw !== null && link.arrivalPitch !== null
              ? { yaw: link.arrivalYaw, pitch: link.arrivalPitch }
              : undefined,
          arrowRotation: link.arrowRotation || undefined,
        })),
    });
  }
  if (scenes.length === 0) return { ok: false, code: "no_ready_media" };

  scenes = dropLinksToMissingScenes(scenes);

  // The tour's own start: the flagged scene if this visit includes it, else
  // the oldest. Walk order always begins here.
  const flagged = visible.find((row) => row.isStart)?.id;
  const tourStartId = flagged && scenes.some((s) => s.id === flagged) ? flagged : scenes[0].id;

  const walkRank = new Map(
    walkOrderFromStart({
      sceneIds: scenes.map((scene) => scene.id),
      links: scenes.flatMap((scene) =>
        (scene.links ?? []).map((link) => ({ fromSceneId: scene.id, toSceneId: link.nodeId, placed: true })),
      ),
      startSceneId: tourStartId,
    }).map((id, index) => [id, index] as const),
  );
  const explicitOrder = new Map(
    visible.filter((row) => row.orderIndex !== null).map((row) => [row.id, row.orderIndex as number] as const),
  );
  scenes.sort((a, b) => {
    const aExplicit = explicitOrder.get(a.id);
    const bExplicit = explicitOrder.get(b.id);
    if (aExplicit !== undefined && bExplicit !== undefined) return aExplicit - bExplicit;
    if (aExplicit !== undefined) return -1;
    if (bExplicit !== undefined) return 1;
    return (walkRank.get(a.id) ?? 0) - (walkRank.get(b.id) ?? 0);
  });

  const requested = input.requestedSceneId;
  const startSceneId = requested && scenes.some((s) => s.id === requested) ? requested : tourStartId;
  const pinnedFloors = floorPlans.filter((plan) =>
    scenes.some((scene) => scene.floorPlanId === plan.id && scene.mapPosition),
  );
  const tourLinks = usableTourLinks(input.tourLinks);

  return {
    ok: true,
    tour: {
      slug: input.slug,
      title: input.title,
      startSceneId,
      scenes,
      tourLinks: tourLinks.length ? tourLinks : undefined,
      timeline: hasTimeline ? timeline.map(({ id, label, isBase }) => ({ id, label, isBase })) : undefined,
      floorPlans: pinnedFloors.length ? pinnedFloors : undefined,
    },
  };
}
