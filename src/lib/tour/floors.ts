/**
 * Floor plans for the mini-map (plans/08 section 6.4: more than one floor).
 *
 * Wanderlust has one map image per tour. A house with an upstairs needs one
 * plan per floor, and the mini-map has to follow the buyer: walk upstairs and
 * the plan changes to the upstairs plan, with only that floor's rooms pinned.
 * PSV's VirtualTourPlugin pins EVERY node on one image, so the viewer swaps the
 * image and replaces the pins itself, using the pure decisions in this file.
 *
 * No DOM, no PSV imports: the rules are unit-tested here.
 */

/**
 * The id prefix VirtualTourPlugin gives map hotspots. Its select-hotspot
 * handler navigates only for ids that start with this, so pins we set
 * ourselves must use it too. Internal to @photo-sphere-viewer/virtual-tour-plugin
 * 5.14.1 (`LINK_ID`); RE-CHECK on any upgrade.
 */
export const TOUR_LINK_HOTSPOT_PREFIX = "__tour-link__";

export interface FloorPlanGeometry {
  id: string;
  width: number;
  height: number;
}

export interface FloorScene {
  id: string;
  name: string;
  floorPlanId?: string;
  mapPosition?: { x: number; y: number };
}

/** A scene's pin in pixels on its own floor's image, or false (off the map). */
export function nodeMapPosition(
  scene: FloorScene,
  plansById: ReadonlyMap<string, FloorPlanGeometry>,
): { x: number; y: number } | false {
  const plan = scene.floorPlanId ? plansById.get(scene.floorPlanId) : undefined;
  if (!plan || !scene.mapPosition) return false;
  return { x: scene.mapPosition.x * plan.width, y: scene.mapPosition.y * plan.height };
}

/**
 * The floor the mini-map opens on: the start scene's, when it is pinned on a
 * plan; otherwise the first floor that has any pinned room; otherwise none.
 */
export function startFloorId(
  scenes: readonly FloorScene[],
  floorPlanIds: readonly string[],
  startSceneId: string,
): string | null {
  const known = new Set(floorPlanIds);
  const start = scenes.find((scene) => scene.id === startSceneId);
  if (start?.floorPlanId && start.mapPosition && known.has(start.floorPlanId)) {
    return start.floorPlanId;
  }
  for (const id of floorPlanIds) {
    if (scenes.some((scene) => scene.floorPlanId === id && scene.mapPosition)) return id;
  }
  return null;
}

/**
 * The floor to show once the buyer is in `sceneId`. A room on a known floor
 * switches to it. A room on no plan (a garden, say) keeps whatever floor was
 * showing, rather than blanking the map.
 */
export function floorForScene(
  scenes: readonly FloorScene[],
  floorPlanIds: readonly string[],
  sceneId: string,
  currentFloorId: string | null,
): string | null {
  const scene = scenes.find((s) => s.id === sceneId);
  if (scene?.floorPlanId && floorPlanIds.includes(scene.floorPlanId)) return scene.floorPlanId;
  return currentFloorId;
}

/** The map hotspots for one floor: only its pinned rooms, in pixels, with tour-link ids. */
export function floorHotspots(
  scenes: readonly FloorScene[],
  plan: FloorPlanGeometry,
): { id: string; x: number; y: number; tooltip: string }[] {
  return scenes
    .filter((scene) => scene.floorPlanId === plan.id && scene.mapPosition)
    .map((scene) => ({
      id: `${TOUR_LINK_HOTSPOT_PREFIX}${scene.id}`,
      x: scene.mapPosition!.x * plan.width,
      y: scene.mapPosition!.y * plan.height,
      tooltip: scene.name,
    }));
}

/** MapPlugin's zoom floor for a fitted plan. Its own default (20) can't fit a large plan in a phone's map. */
export const MAP_MIN_ZOOM = 5;

/**
 * The mini-map zoom (percent) that fits a whole floor plan inside the round
 * map. MapPlugin's default of 100% shows the plan at full size, which in a
 * 96 to 150px circle is a few square meters of blank floor: no walls, no
 * other rooms. Fitting the plan's diagonal keeps even its corners inside the
 * circle. Never above 100%: a small plan is not blown up past its pixels.
 */
export function fitZoomPercent(plan: { width: number; height: number }, mapSizePx: number): number {
  const diagonal = Math.hypot(plan.width, plan.height);
  if (!(diagonal > 0) || !(mapSizePx > 0)) return 100;
  const fitted = (mapSizePx / diagonal) * 100;
  return Math.round(Math.min(100, Math.max(MAP_MIN_ZOOM, fitted)) * 10) / 10;
}
