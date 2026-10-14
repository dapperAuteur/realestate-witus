import { describe, expect, it } from "vitest";
import {
  fitZoomPercent,
  floorForScene,
  floorHotspots,
  MAP_MIN_ZOOM,
  nodeMapPosition,
  startFloorId,
  TOUR_LINK_HOTSPOT_PREFIX,
  type FloorScene,
} from "./floors";

const ground = { id: "g", width: 1000, height: 500 };
const upstairs = { id: "u", width: 800, height: 800 };
const plansById = new Map([
  [ground.id, ground],
  [upstairs.id, upstairs],
]);

const scenes: FloorScene[] = [
  { id: "hall", name: "Hall", floorPlanId: "g", mapPosition: { x: 0.5, y: 0.5 } },
  { id: "kitchen", name: "Kitchen", floorPlanId: "g", mapPosition: { x: 0.1, y: 0.2 } },
  { id: "bed", name: "Bedroom", floorPlanId: "u", mapPosition: { x: 0.25, y: 0.75 } },
  { id: "garden", name: "Garden" },
  { id: "landing", name: "Landing", floorPlanId: "u" },
];

describe("nodeMapPosition", () => {
  it("converts a normalized pin to pixels on its own floor's image", () => {
    expect(nodeMapPosition(scenes[2], plansById)).toEqual({ x: 200, y: 600 });
  });

  it("is false for a room on no plan, or on a plan but not pinned", () => {
    expect(nodeMapPosition(scenes[3], plansById)).toBe(false);
    expect(nodeMapPosition(scenes[4], plansById)).toBe(false);
  });

  it("is false when the floor plan is missing (deleted, or its image not ready)", () => {
    expect(nodeMapPosition({ ...scenes[0], floorPlanId: "gone" }, plansById)).toBe(false);
  });
});

describe("startFloorId", () => {
  it("opens on the start scene's floor", () => {
    expect(startFloorId(scenes, ["g", "u"], "bed")).toBe("u");
  });

  it("falls back to the first floor with a pinned room when the start room is unpinned", () => {
    expect(startFloorId(scenes, ["u", "g"], "garden")).toBe("u");
    expect(startFloorId(scenes, ["g", "u"], "landing")).toBe("g");
  });

  it("is null when no room is pinned anywhere", () => {
    expect(startFloorId([{ id: "a", name: "A", floorPlanId: "g" }], ["g"], "a")).toBeNull();
  });
});

describe("floorForScene", () => {
  it("switches to the room's floor", () => {
    expect(floorForScene(scenes, ["g", "u"], "bed", "g")).toBe("u");
  });

  it("keeps the current floor for a room on no plan", () => {
    expect(floorForScene(scenes, ["g", "u"], "garden", "u")).toBe("u");
  });

  it("switches even when the room is on the floor but not pinned", () => {
    expect(floorForScene(scenes, ["g", "u"], "landing", "g")).toBe("u");
  });
});

describe("floorHotspots", () => {
  it("pins only that floor's placed rooms, with ids the tour plugin navigates on", () => {
    expect(floorHotspots(scenes, ground)).toEqual([
      { id: `${TOUR_LINK_HOTSPOT_PREFIX}hall`, x: 500, y: 250, tooltip: "Hall" },
      { id: `${TOUR_LINK_HOTSPOT_PREFIX}kitchen`, x: 100, y: 100, tooltip: "Kitchen" },
    ]);
    expect(floorHotspots(scenes, upstairs).map((h) => h.id)).toEqual([`${TOUR_LINK_HOTSPOT_PREFIX}bed`]);
  });
});

describe("fitZoomPercent", () => {
  it("fits the plan's diagonal inside the round map", () => {
    // 1000 x 700 plan, diagonal ~1220.7px, in a 150px map: ~12.3%.
    expect(fitZoomPercent({ width: 1000, height: 700 }, 150)).toBeCloseTo(12.3, 1);
  });

  it("never zooms a small plan past 100%", () => {
    expect(fitZoomPercent({ width: 60, height: 40 }, 150)).toBe(100);
  });

  it("stops at the minimum for a huge plan on a phone", () => {
    expect(fitZoomPercent({ width: 8000, height: 6000 }, 96)).toBe(MAP_MIN_ZOOM);
  });

  it("falls back to 100% on nonsense input", () => {
    expect(fitZoomPercent({ width: 0, height: 0 }, 150)).toBe(100);
    expect(fitZoomPercent({ width: 1000, height: 700 }, Number.NaN)).toBe(100);
  });
});
