// Ported from wanderlearn-app src/lib/moments/moments.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import {
  effectiveMoment,
  fellBackToBase,
  hotspotShowsIn,
  momentNodeId,
  momentsForScene,
  normalizeHeadingOffset,
  parseMomentNodeId,
  sortMoments,
  timeStickyTarget,
} from "./moments";
import type { Moment } from "./types";

const m = (id: string, label: string, extra: Partial<Moment> = {}): Moment => ({
  id,
  label,
  occurredOn: null,
  sortOrder: 0,
  isBase: false,
  ...extra,
});

describe("sortMoments", () => {
  it("orders by sortOrder, then date (undated last), then label", () => {
    const sorted = sortMoments([
      m("now", "Now", { isBase: true, sortOrder: 2 }),
      m("b", "Opening day"),
      m("a", "1998", { occurredOn: "1998-05-01" }),
      m("c", "2003", { occurredOn: "2003-01-01" }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "c", "b", "now"]);
  });

  it("does not mutate its input", () => {
    const input = [m("b", "B", { sortOrder: 1 }), m("a", "A")];
    sortMoments(input);
    expect(input.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("node ids", () => {
  it("keeps the plain scene id for the base view", () => {
    expect(momentNodeId("scene-1", null)).toBe("scene-1");
    expect(parseMomentNodeId("scene-1")).toEqual({ sceneId: "scene-1", momentId: null });
  });

  it("round-trips a moment node", () => {
    const id = momentNodeId("scene-1", "moment-9");
    expect(id).toBe("scene-1~moment-9");
    expect(parseMomentNodeId(id)).toEqual({ sceneId: "scene-1", momentId: "moment-9" });
  });
});

describe("momentsForScene", () => {
  it("always includes the base, plus moments with a photo here, in timeline order", () => {
    const moments = [
      m("now", "Now", { isBase: true, sortOrder: 9 }),
      m("y1998", "1998", { sortOrder: 1 }),
      m("y2003", "2003", { sortOrder: 2 }),
    ];
    expect(momentsForScene(moments, new Set(["y2003"])).map((x) => x.id)).toEqual(["y2003", "now"]);
  });
});

describe("timeStickyTarget", () => {
  it("keeps the moment when the next scene has it", () => {
    expect(timeStickyTarget("hall", "y1998", new Set(["y1998"]))).toBe("hall~y1998");
  });

  it("falls back to the base view when it doesn't", () => {
    expect(timeStickyTarget("hall", "y1998", new Set(["y2003"]))).toBe("hall");
  });

  it("goes to the base view from the base view", () => {
    expect(timeStickyTarget("hall", null, new Set(["y1998"]))).toBe("hall");
  });
});

describe("hotspotShowsIn", () => {
  it("shows an unscoped hotspot everywhere", () => {
    expect(hotspotShowsIn(null, "y1998")).toBe(true);
    expect(hotspotShowsIn(undefined, "now")).toBe(true);
  });

  it("shows a scoped hotspot only in its moment, base included", () => {
    expect(hotspotShowsIn("y1998", "y1998")).toBe(true);
    expect(hotspotShowsIn("y1998", "now")).toBe(false);
    expect(hotspotShowsIn("now", "now")).toBe(true);
  });
});

describe("fellBackToBase", () => {
  it("is true only when a visitor in a moment lands on a base node", () => {
    expect(fellBackToBase("y1998", "hall")).toBe(true);
    expect(fellBackToBase("y1998", "hall~y1998")).toBe(false);
    expect(fellBackToBase(null, "hall")).toBe(false);
  });
});

describe("normalizeHeadingOffset", () => {
  it.each([
    [0, 0],
    [190, -170],
    [-190, 170],
    [360, 0],
    [-180, -180],
    [180, -180],
  ])("%s → %s", (input, expected) => {
    expect(normalizeHeadingOffset(input)).toBe(expected);
  });
});

describe("effectiveMoment", () => {
  it("shows the chosen moment where the scene has it", () => {
    expect(effectiveMoment("y1998", "now", new Set(["y1998"]))).toBe("y1998");
  });

  it("falls back to the base view where it doesn't", () => {
    expect(effectiveMoment("y1998", "now", new Set())).toBe("now");
  });

  it("is the base view when the base (or nothing) is chosen", () => {
    expect(effectiveMoment("now", "now", new Set(["y1998"]))).toBe("now");
    expect(effectiveMoment(null, "now", new Set())).toBe("now");
    expect(effectiveMoment(null, null, new Set())).toBeNull();
  });
});
