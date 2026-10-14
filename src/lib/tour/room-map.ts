// The room map's geometry (plans/04, "graph mode"): where each room's card
// sits and which lines join them. Pure, so the layout is tested without a
// browser, and deterministic, so the map never reshuffles between visits.
//
// Columns are walking distance from the start room (layoutTourGraph's BFS
// layers); rooms nothing reaches get a trailing column of their own, so a
// broken tour is visible at a glance rather than tidied away.

import { layoutTourGraph, type TourGraphInput } from "./tour-graph";

export const ROOM_MAP = {
  nodeWidth: 168,
  nodeHeight: 60,
  columnGap: 72,
  rowGap: 24,
  pad: 24,
} as const;

export interface RoomMapEdge {
  /** The pair, in a stable order (the first is the one listed first in the tour). */
  a: string;
  b: string;
  /** Doorways both ways, or only from `a` to `b` / `b` to `a`. */
  direction: "both" | "a-to-b" | "b-to-a";
  /** Every doorway in the pair has its arrow placed. Unplaced ones are invisible to buyers. */
  placed: boolean;
}

export interface RoomMapLayout {
  width: number;
  height: number;
  /** Card centers, in pixels. */
  nodes: Map<string, { x: number; y: number }>;
  edges: RoomMapEdge[];
}

export function roomMapLayout(input: TourGraphInput): RoomMapLayout {
  const { nodeWidth, nodeHeight, columnGap, rowGap, pad } = ROOM_MAP;
  const normalized = layoutTourGraph(input);

  // Back from the normalized canvas to columns and rows.
  const columns = new Map<number, { id: string; y: number }[]>();
  for (const id of input.sceneIds) {
    const p = normalized.get(id);
    if (!p) continue;
    const column = columns.get(p.x) ?? [];
    column.push({ id, y: p.y });
    columns.set(p.x, column);
  }
  const ordered = [...columns.entries()].sort((l, r) => l[0] - r[0]).map(([, rooms]) => rooms.sort((l, r) => l.y - r.y));
  const tallest = Math.max(1, ...ordered.map((c) => c.length));

  const nodes = new Map<string, { x: number; y: number }>();
  ordered.forEach((rooms, col) => {
    // Shorter columns sit centered against the tallest.
    const offset = ((tallest - rooms.length) * (nodeHeight + rowGap)) / 2;
    rooms.forEach(({ id }, row) => {
      nodes.set(id, {
        x: pad + col * (nodeWidth + columnGap) + nodeWidth / 2,
        y: pad + offset + row * (nodeHeight + rowGap) + nodeHeight / 2,
      });
    });
  });

  const order = new Map(input.sceneIds.map((id, i) => [id, i]));
  const pairs = new Map<string, { a: string; b: string; ab: boolean; ba: boolean; placed: boolean }>();
  for (const link of input.links) {
    if (!nodes.has(link.fromSceneId) || !nodes.has(link.toSceneId) || link.fromSceneId === link.toSceneId) continue;
    const [a, b] = [link.fromSceneId, link.toSceneId].sort((l, r) => order.get(l)! - order.get(r)!);
    const key = `${a}|${b}`;
    const pair = pairs.get(key) ?? { a, b, ab: false, ba: false, placed: true };
    if (link.fromSceneId === a) pair.ab = true;
    else pair.ba = true;
    pair.placed &&= link.placed;
    pairs.set(key, pair);
  }

  return {
    width: pad * 2 + ordered.length * nodeWidth + Math.max(0, ordered.length - 1) * columnGap,
    height: pad * 2 + tallest * nodeHeight + (tallest - 1) * rowGap,
    nodes,
    edges: [...pairs.values()].map(({ a, b, ab, ba, placed }) => ({
      a,
      b,
      direction: ab && ba ? "both" : ab ? "a-to-b" : "b-to-a",
      placed,
    })),
  };
}

/** The rooms a room is joined to, either way, in tour order. */
export function neighborsOf(sceneId: string, edges: readonly RoomMapEdge[]): string[] {
  return edges.flatMap((edge) => (edge.a === sceneId ? [edge.b] : edge.b === sceneId ? [edge.a] : []));
}

/**
 * A line from one card to another, trimmed to the cards' edges (plus a small
 * gap), so an arrowhead at the end sits outside the card instead of under it.
 */
export function edgeLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gap = 4,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const halfW = ROOM_MAP.nodeWidth / 2 + gap;
  const halfH = ROOM_MAP.nodeHeight / 2 + gap;
  // How far along the center-to-center line the card's edge is.
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  if (!Number.isFinite(t) || t >= 0.5) return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  return { x1: from.x + dx * t, y1: from.y + dy * t, x2: to.x - dx * t, y2: to.y - dy * t };
}
