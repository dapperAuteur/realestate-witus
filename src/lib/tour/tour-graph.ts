// Ported from wanderlearn-app src/lib/tour-graph.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * Pure graph analysis over a listing tour's scenes and links.
 *
 * No "server-only", no DB imports: synchronous functions over ids, so this is
 * unit-testable on its own and safe to call from anywhere.
 */

export interface SceneGraphStats {
  sceneId: string;
  /** All outgoing rows, duplicates included. */
  outgoing: number;
  incoming: number;
  isStart: boolean;
  /** No incoming links and not the start — nothing leads here. */
  isOrphan: boolean;
  /** No outgoing links — a visitor arriving here is stuck. */
  isDeadEnd: boolean;
  /** Not reachable walking links from the start scene. */
  isUnreachable: boolean;
  /** Outgoing links with no placed arrow (null yaw/pitch) — invisible to visitors. */
  needsPlacement: number;
  /** Target scene ids that appear more than once from this scene. */
  duplicateTargets: string[];
}

export interface TourGraphInput {
  sceneIds: string[];
  links: { fromSceneId: string; toSceneId: string; placed: boolean }[];
  /**
   * The effective start: the scene flagged is_start when set and present,
   * else the first scene in order (build-tour's fallback). Caller resolves; null when
   * the listing has no scenes.
   */
  startSceneId: string | null;
}

export function analyzeTourGraph(input: TourGraphInput): Map<string, SceneGraphStats> {
  const inSet = new Set(input.sceneIds);
  const out = new Map<string, SceneGraphStats>();
  for (const id of input.sceneIds) {
    out.set(id, {
      sceneId: id,
      outgoing: 0,
      incoming: 0,
      isStart: id === input.startSceneId,
      isOrphan: false,
      isDeadEnd: false,
      isUnreachable: false,
      needsPlacement: 0,
      duplicateTargets: [],
    });
  }

  // Adjacency for BFS uses only edges whose BOTH endpoints are at this
  // destination — cross-destination links count in `outgoing` (they exist and
  // the creator should see them) but are never traversed for reachability.
  const adjacency = new Map<string, string[]>();
  const targetCounts = new Map<string, Map<string, number>>();
  for (const link of input.links) {
    const from = out.get(link.fromSceneId);
    if (from) {
      from.outgoing += 1;
      if (!link.placed) from.needsPlacement += 1;
      const counts = targetCounts.get(link.fromSceneId) ?? new Map<string, number>();
      counts.set(link.toSceneId, (counts.get(link.toSceneId) ?? 0) + 1);
      targetCounts.set(link.fromSceneId, counts);
    }
    const to = out.get(link.toSceneId);
    if (to) to.incoming += 1;
    if (inSet.has(link.fromSceneId) && inSet.has(link.toSceneId)) {
      const list = adjacency.get(link.fromSceneId) ?? [];
      list.push(link.toSceneId);
      adjacency.set(link.fromSceneId, list);
    }
  }

  for (const [sceneId, counts] of targetCounts) {
    const stats = out.get(sceneId);
    if (!stats) continue;
    stats.duplicateTargets = [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([target]) => target);
  }

  // BFS from the start for reachability.
  const visited = new Set<string>();
  if (input.startSceneId && inSet.has(input.startSceneId)) {
    const queue = [input.startSceneId];
    visited.add(input.startSceneId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
  }

  for (const stats of out.values()) {
    stats.isOrphan = stats.incoming === 0 && !stats.isStart;
    stats.isDeadEnd = stats.outgoing === 0;
    stats.isUnreachable = input.startSceneId !== null && !visited.has(stats.sceneId);
  }
  return out;
}

/**
 * Deterministic BFS-layered layout onto a normalized 0..1 canvas.
 *
 * x = BFS depth from the start (unreachable scenes go in trailing columns),
 * y = position within the layer. Deterministic by construction — same graph,
 * same layout — so the map does not reshuffle between visits, which is the
 * failure mode that makes force-directed layouts wrong for a you-are-here map.
 * Margins keep pins inside the image. Meant as a starting arrangement the
 * creator then adjusts with the normal placement controls.
 */
export function layoutTourGraph(input: TourGraphInput): Map<string, { x: number; y: number }> {
  const inSet = new Set(input.sceneIds);
  const adjacency = new Map<string, string[]>();
  for (const link of input.links) {
    if (inSet.has(link.fromSceneId) && inSet.has(link.toSceneId)) {
      const list = adjacency.get(link.fromSceneId) ?? [];
      list.push(link.toSceneId);
      adjacency.set(link.fromSceneId, list);
    }
  }

  const depth = new Map<string, number>();
  if (input.startSceneId && inSet.has(input.startSceneId)) {
    const queue = [input.startSceneId];
    depth.set(input.startSceneId, 0);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const d = depth.get(current)!;
      for (const next of adjacency.get(current) ?? []) {
        if (depth.has(next)) continue;
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  // Unreachable scenes: stable trailing column so they are visible, not lost.
  const maxDepth = Math.max(0, ...depth.values());
  for (const id of input.sceneIds) {
    if (!depth.has(id)) depth.set(id, maxDepth + 1);
  }

  const layers = new Map<number, string[]>();
  // input.sceneIds order (caller passes a stable order) decides within-layer order.
  for (const id of input.sceneIds) {
    const d = depth.get(id)!;
    const layer = layers.get(d) ?? [];
    layer.push(id);
    layers.set(d, layer);
  }

  const MARGIN = 0.1;
  const span = 1 - MARGIN * 2;
  const columnCount = layers.size;
  const positions = new Map<string, { x: number; y: number }>();
  const sortedDepths = [...layers.keys()].sort((a, b) => a - b);
  sortedDepths.forEach((d, columnIndex) => {
    const layer = layers.get(d)!;
    const x = columnCount === 1 ? 0.5 : MARGIN + (span * columnIndex) / (columnCount - 1);
    layer.forEach((id, rowIndex) => {
      const y =
        layer.length === 1 ? 0.5 : MARGIN + (span * rowIndex) / (layer.length - 1);
      positions.set(id, { x: round4(x), y: round4(y) });
    });
  });
  return positions;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * The order a visitor would actually walk the tour, for the stop rail.
 *
 * WHY NOT JUST USE THE SCENE ARRAY. `assembleTour` returns scenes oldest-first
 * by `createdAt`, because `scenes` has no sort column yet. That order has
 * nothing to do with the tour: the Patina Gallery tour starts at "Front Door
 * Outside", which happens to have been created ninth, so a rail numbered by
 * array position greeted a visitor with "Stop 9 of 9 — 8 left" on arrival.
 * Contradictory, and precisely the kind of misleading progress indicator the
 * goal-gradient research says destroys trust in every other number shown.
 *
 * So: breadth-first from the start scene along the link graph, which is the
 * order the arrows lead someone through. The start is always stop 1.
 *
 * Neighbors are visited in link declaration order, and unreachable scenes are
 * appended in their original order rather than dropped — a scene nothing links
 * to is a creator bug (`analyzeTourGraph` reports it as `isUnreachable`), but a
 * visitor should still be able to reach it from the rail rather than have it
 * silently vanish from a count that claims to be complete.
 *
 * Deterministic: same graph in, same order out, so the rail does not reshuffle
 * between visits.
 *
 * Superseded once `scenes.order_index` exists — at that point the creator's
 * explicit sequence wins and this becomes the fallback for tours that have not
 * been sequenced.
 */
export function walkOrderFromStart(input: TourGraphInput): string[] {
  const inSet = new Set(input.sceneIds);
  const adjacency = new Map<string, string[]>();
  for (const link of input.links) {
    if (!inSet.has(link.fromSceneId) || !inSet.has(link.toSceneId)) continue;
    const list = adjacency.get(link.fromSceneId) ?? [];
    if (!list.includes(link.toSceneId)) list.push(link.toSceneId);
    adjacency.set(link.fromSceneId, list);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();

  if (input.startSceneId && inSet.has(input.startSceneId)) {
    const queue = [input.startSceneId];
    seen.add(input.startSceneId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }

  for (const id of input.sceneIds) {
    if (!seen.has(id)) ordered.push(id);
  }

  return ordered;
}

/**
 * Drops links whose target scene is not in `scenes`.
 *
 * A stored link can name a scene that the visitor's tour doesn't include: a
 * draft or unpublished scene on a public visit, or one skipped because its
 * panorama isn't ready. PSV still draws an arrow for such a link, and clicking
 * it throws "Node … not found", so the visitor gets an arrow that goes
 * nowhere. Scenes with nothing to drop are returned as the same object.
 */
export function dropLinksToMissingScenes<
  S extends { id: string; links?: { nodeId: string }[] },
>(scenes: S[]): S[] {
  const present = new Set(scenes.map((scene) => scene.id));
  return scenes.map((scene) =>
    scene.links?.some((link) => !present.has(link.nodeId))
      ? { ...scene, links: scene.links.filter((link) => present.has(link.nodeId)) }
      : scene,
  );
}
