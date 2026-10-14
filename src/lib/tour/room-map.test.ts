import { describe, expect, it } from "vitest";
import { ROOM_MAP, edgeLine, neighborsOf, roomMapLayout } from "./room-map";

const link = (fromSceneId: string, toSceneId: string, placed = true) => ({ fromSceneId, toSceneId, placed });
const { nodeWidth, nodeHeight, columnGap, rowGap, pad } = ROOM_MAP;

describe("roomMapLayout", () => {
  it("puts rooms in columns by walking distance from the start", () => {
    const layout = roomMapLayout({
      sceneIds: ["hall", "kitchen", "lounge", "attic"],
      links: [link("hall", "kitchen"), link("kitchen", "hall"), link("hall", "lounge"), link("lounge", "hall")],
      startSceneId: "hall",
    });
    const x = (id: string) => layout.nodes.get(id)!.x;
    expect(x("hall")).toBe(pad + nodeWidth / 2);
    expect(x("kitchen")).toBe(x("lounge"));
    expect(x("kitchen")).toBe(x("hall") + nodeWidth + columnGap);
    // Nothing reaches the attic: a column of its own at the end, not hidden.
    expect(x("attic")).toBe(x("kitchen") + nodeWidth + columnGap);
    expect(layout.width).toBe(pad * 2 + 3 * nodeWidth + 2 * columnGap);
    expect(layout.height).toBe(pad * 2 + 2 * nodeHeight + rowGap);
  });

  it("centers a short column against the tallest one", () => {
    const layout = roomMapLayout({
      sceneIds: ["hall", "a", "b"],
      links: [link("hall", "a"), link("hall", "b")],
      startSceneId: "hall",
    });
    const mid = (layout.nodes.get("a")!.y + layout.nodes.get("b")!.y) / 2;
    expect(layout.nodes.get("hall")!.y).toBe(mid);
  });

  it("draws one line per pair, says which way it goes, and flags unplaced arrows", () => {
    const { edges } = roomMapLayout({
      sceneIds: ["hall", "kitchen", "lounge"],
      links: [link("hall", "kitchen"), link("kitchen", "hall", false), link("lounge", "hall"), link("hall", "hall")],
      startSceneId: "hall",
    });
    expect(edges).toEqual([
      { a: "hall", b: "kitchen", direction: "both", placed: false },
      { a: "hall", b: "lounge", direction: "b-to-a", placed: true },
    ]);
  });

  it("is the same map every time for the same tour", () => {
    const input = { sceneIds: ["a", "b", "c"], links: [link("a", "b"), link("b", "c")], startSceneId: "a" };
    expect(roomMapLayout(input)).toEqual(roomMapLayout(input));
  });

  it("handles an empty tour", () => {
    expect(roomMapLayout({ sceneIds: [], links: [], startSceneId: null }).nodes.size).toBe(0);
  });
});

describe("neighborsOf", () => {
  it("lists the rooms joined either way", () => {
    const { edges } = roomMapLayout({
      sceneIds: ["hall", "kitchen", "lounge"],
      links: [link("hall", "kitchen"), link("lounge", "hall")],
      startSceneId: "hall",
    });
    expect(neighborsOf("hall", edges)).toEqual(["kitchen", "lounge"]);
    expect(neighborsOf("lounge", edges)).toEqual(["hall"]);
  });
});

describe("edgeLine", () => {
  it("starts and ends at the cards' edges, not their centers", () => {
    const line = edgeLine({ x: 100, y: 50 }, { x: 400, y: 50 });
    expect(line).toEqual({ x1: 100 + nodeWidth / 2 + 4, y1: 50, x2: 400 - nodeWidth / 2 - 4, y2: 50 });
  });

  it("leaves through the top or bottom when the other card is mostly above or below", () => {
    const line = edgeLine({ x: 100, y: 50 }, { x: 110, y: 350 });
    expect(line.y1).toBeCloseTo(50 + nodeHeight / 2 + 4, 6);
    expect(line.y2).toBeCloseTo(350 - nodeHeight / 2 - 4, 6);
  });

  it("falls back to center to center when cards overlap", () => {
    expect(edgeLine({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x1: 0, y1: 0, x2: 10, y2: 0 });
  });
});
