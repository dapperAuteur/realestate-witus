// Ported from wanderlearn-app src/lib/moments/moments.ts @ c7f5616, 2026-10-14 (plans/08).
import type { Moment } from "./types";

/**
 * Separates a scene id from a moment id in a viewer node id. Scene and moment
 * ids are UUIDs, which never contain "~".
 */
export const MOMENT_NODE_SEPARATOR = "~";

/**
 * Timeline order: the creator's sort order, then the date (undated last), then
 * the label. The base view has no special place; "Now" usually sorts last
 * because creators add it last or date it latest, but a "before" tour may put
 * the base first.
 */
export function sortMoments<M extends Moment>(moments: M[]): M[] {
  return [...moments].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      compareDates(a.occurredOn, b.occurredOn) ||
      a.label.localeCompare(b.label),
  );
}

function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * The viewer node id for a scene in a moment. The base view keeps the plain
 * scene id, so existing ?scene= links, share links and stop numbers keep working.
 */
export function momentNodeId(sceneId: string, momentId: string | null): string {
  return momentId ? `${sceneId}${MOMENT_NODE_SEPARATOR}${momentId}` : sceneId;
}

/** Splits a node id back into its scene and moment. `momentId` is null for a base node. */
export function parseMomentNodeId(nodeId: string): { sceneId: string; momentId: string | null } {
  const at = nodeId.indexOf(MOMENT_NODE_SEPARATOR);
  return at === -1
    ? { sceneId: nodeId, momentId: null }
    : { sceneId: nodeId.slice(0, at), momentId: nodeId.slice(at + 1) };
}

/**
 * The moments a scene can show, in timeline order: the base view always, plus
 * every non-base moment that has a photo in this scene.
 */
export function momentsForScene<M extends Moment>(
  moments: M[],
  momentIdsWithPhoto: ReadonlySet<string>,
): M[] {
  return sortMoments(moments.filter((m) => m.isBase || momentIdsWithPhoto.has(m.id)));
}

/**
 * Where an arrow leads, keeping the visitor's time when the next room has it.
 * From a non-base moment, the arrow goes to the same moment in the target
 * scene if that scene has a photo for it; otherwise to the target's base view.
 */
export function timeStickyTarget(
  targetSceneId: string,
  currentMomentId: string | null,
  targetMomentIdsWithPhoto: ReadonlySet<string>,
): string {
  return currentMomentId && targetMomentIdsWithPhoto.has(currentMomentId)
    ? momentNodeId(targetSceneId, currentMomentId)
    : targetSceneId;
}

/**
 * Whether a hotspot shows in a moment. Null = every moment (the default).
 * `momentId` is the moment being shown; pass the BASE moment's id for a base
 * node, so a hotspot limited to "Now" shows there and nowhere else.
 */
export function hotspotShowsIn(hotspotMomentId: string | null | undefined, momentId: string | null): boolean {
  return !hotspotMomentId || hotspotMomentId === momentId;
}

/**
 * True when a visitor who was in `wantedMomentId` arrived somewhere that has no
 * photo for it, so the viewer should say it is showing the base view instead.
 */
export function fellBackToBase(wantedMomentId: string | null, arrivedNodeId: string): boolean {
  return wantedMomentId !== null && parseMomentNodeId(arrivedNodeId).momentId === null;
}

/** Normalizes a heading offset into −180..180 degrees. */
export function normalizeHeadingOffset(deg: number): number {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/**
 * The moment a scene actually shows. The visitor's chosen moment if this scene
 * has a photo for it (or it is the base view); otherwise the base view.
 */
export function effectiveMoment(
  selectedMomentId: string | null,
  baseMomentId: string | null,
  momentIdsWithPhoto: ReadonlySet<string>,
): string | null {
  if (!selectedMomentId || selectedMomentId === baseMomentId) return baseMomentId;
  return momentIdsWithPhoto.has(selectedMomentId) ? selectedMomentId : baseMomentId;
}
