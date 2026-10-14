import { describe, expect, it } from "vitest";
import {
  buildTour,
  type BuildTourInput,
  type LinkRow,
  type MediaInfo,
  type SceneRow,
} from "./build-tour";

const media = (publicId: string, over: Partial<MediaInfo> = {}): MediaInfo => ({
  publicId,
  kind: "panorama",
  status: "ready",
  width: 6000,
  height: 3000,
  ...over,
});

const scene = (id: string, over: Partial<SceneRow> = {}): SceneRow => ({
  id,
  name: id,
  caption: null,
  panoramaMediaId: `m-${id}`,
  posterMediaId: null,
  startYaw: null,
  startPitch: null,
  rollOffsetDeg: null,
  minPitchDeg: null,
  floorPlanId: null,
  mapX: null,
  mapY: null,
  orderIndex: null,
  isStart: false,
  status: "published",
  ...over,
});

const link = (from: string, to: string, over: Partial<LinkRow> = {}): LinkRow => ({
  fromSceneId: from,
  toSceneId: to,
  name: null,
  yaw: 0,
  pitch: 0,
  arrivalYaw: null,
  arrivalPitch: null,
  arrowRotation: 0,
  ...over,
});

function input(over: Partial<BuildTourInput> = {}): BuildTourInput {
  const scenes = over.scenes ?? [scene("a"), scene("b"), scene("c")];
  return {
    slug: "one-main",
    title: "One Main",
    tourLinks: [],
    scenes,
    links: [],
    hotspots: [],
    moments: [],
    momentPhotos: [],
    floorPlans: [],
    media: new Map(scenes.map((s) => [s.panoramaMediaId, media(`p/${s.id}`)])),
    urls: {
      panorama: (id) => `pano:${id}`,
      thumbnail: (id) => `thumb:${id}`,
      floorPlan: (id, width) => ({ url: `plan:${id}`, width: Math.min(width, 1600) }),
    },
    ...over,
  };
}

function tourOf(result: ReturnType<typeof buildTour>) {
  if (!result.ok) throw new Error(`expected a tour, got ${result.code}`);
  return result.tour;
}

describe("buildTour: who sees what", () => {
  it("shows buyers published rooms only", () => {
    const tour = tourOf(buildTour(input({ scenes: [scene("a"), scene("b", { status: "draft" })] })));
    expect(tour.scenes.map((s) => s.id)).toEqual(["a"]);
  });

  it("shows staff previews every status", () => {
    const scenes = [scene("a"), scene("b", { status: "draft" }), scene("c", { status: "unpublished" })];
    const tour = tourOf(buildTour(input({ scenes, includeUnpublished: true })));
    expect(tour.scenes.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("says no_scenes when nothing is published", () => {
    expect(buildTour(input({ scenes: [scene("a", { status: "draft" })] }))).toEqual({ ok: false, code: "no_scenes" });
  });

  it("drops rooms whose panorama is not ready, or is not a panorama", () => {
    const scenes = [scene("a"), scene("b"), scene("c")];
    const mediaMap = new Map([
      ["m-a", media("p/a")],
      ["m-b", media("p/b", { status: "uploading" })],
      ["m-c", media("p/c", { kind: "photo" })],
    ]);
    const tour = tourOf(buildTour(input({ scenes, media: mediaMap })));
    expect(tour.scenes.map((s) => s.id)).toEqual(["a"]);
  });

  it("says no_ready_media when every panorama is still uploading", () => {
    const mediaMap = new Map([["m-a", media("p/a", { status: "uploading" })]]);
    expect(buildTour(input({ scenes: [scene("a")], media: mediaMap }))).toEqual({
      ok: false,
      code: "no_ready_media",
    });
  });
});

describe("buildTour: arrows", () => {
  it("turns only placed links into arrows", () => {
    const links = [link("a", "b"), link("a", "c", { yaw: null, pitch: null })];
    const tour = tourOf(buildTour(input({ links })));
    expect(tour.scenes.find((s) => s.id === "a")?.links?.map((l) => l.nodeId)).toEqual(["b"]);
  });

  it("never leaves an arrow to a room this visit doesn't include", () => {
    const scenes = [scene("a"), scene("b", { status: "draft" })];
    const tour = tourOf(buildTour(input({ scenes, links: [link("a", "b")] })));
    expect(tour.scenes[0].links).toEqual([]);
  });

  it("carries arrival headings and arrow turns", () => {
    const links = [link("a", "b", { arrivalYaw: 1, arrivalPitch: 0.1, arrowRotation: 45, name: "Into the kitchen" })];
    const tour = tourOf(buildTour(input({ links })));
    expect(tour.scenes[0].links?.[0]).toEqual({
      nodeId: "b",
      name: "Into the kitchen",
      position: { yaw: 0, pitch: 0 },
      arrivalPosition: { yaw: 1, pitch: 0.1 },
      arrowRotation: 45,
    });
  });
});

describe("buildTour: order and start", () => {
  it("starts at the flagged room and orders by the walk from it", () => {
    const scenes = [scene("a"), scene("b"), scene("c", { isStart: true })];
    const links = [link("c", "a"), link("a", "b")];
    const tour = tourOf(buildTour(input({ scenes, links })));
    expect(tour.startSceneId).toBe("c");
    expect(tour.scenes.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("puts an explicit order first", () => {
    const scenes = [scene("a", { isStart: true }), scene("b", { orderIndex: 2 }), scene("c", { orderIndex: 1 })];
    const tour = tourOf(buildTour(input({ scenes })));
    expect(tour.scenes.map((s) => s.id)).toEqual(["c", "b", "a"]);
  });

  it("opens on a requested room without reordering the tour", () => {
    const scenes = [scene("a", { isStart: true }), scene("b"), scene("c")];
    const links = [link("a", "b"), link("b", "c")];
    const tour = tourOf(buildTour(input({ scenes, links, requestedSceneId: "c" })));
    expect(tour.startSceneId).toBe("c");
    expect(tour.scenes.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores a requested room this visit doesn't include", () => {
    const scenes = [scene("a", { isStart: true }), scene("b", { status: "draft" })];
    const tour = tourOf(buildTour(input({ scenes, requestedSceneId: "b" })));
    expect(tour.startSceneId).toBe("a");
  });

  it("falls back to the oldest room when the flagged start is unpublished", () => {
    const scenes = [scene("a"), scene("b", { isStart: true, status: "draft" })];
    expect(tourOf(buildTour(input({ scenes }))).startSceneId).toBe("a");
  });
});

describe("buildTour: hotspots and links", () => {
  it("drops a hotspot link that is not http(s), keeping the hotspot", () => {
    const hotspots = [
      { id: "h", sceneId: "a", yaw: 0, pitch: 0, title: "Range", content: "Gas", externalUrl: "javascript:alert(1)", momentId: null },
    ];
    const tour = tourOf(buildTour(input({ hotspots })));
    expect(tour.scenes[0].hotspots?.[0]).toMatchObject({ title: "Range", content: "Gas", externalUrl: undefined });
  });

  it("keeps usable tour links only", () => {
    const tourLinks = [
      { kind: "inquiry" as const, label: "Request a tour", intent: "tour_request" as const, featured: true },
      { kind: "url" as const, label: "Bad", url: "data:text/html,x", featured: false },
    ];
    const tour = tourOf(buildTour(input({ tourLinks })));
    expect(tour.tourLinks).toEqual([tourLinks[0]]);
  });
});

describe("buildTour: moments", () => {
  const moments = [
    { id: "now", label: "After", occurredOn: null, sortOrder: 1, isBase: true },
    { id: "before", label: "Before", occurredOn: null, sortOrder: 0, isBase: false },
  ];

  it("has no timeline when only the base view exists", () => {
    const tour = tourOf(buildTour(input({ moments: [moments[0]] })));
    expect(tour.timeline).toBeUndefined();
  });

  it("orders the timeline and attaches ready photos only", () => {
    const mediaMap = new Map([
      ["m-a", media("p/a")],
      ["m-b", media("p/b")],
      ["m-c", media("p/c")],
      ["before-a", media("p/before-a")],
      ["before-b", media("p/before-b", { status: "uploading" })],
    ]);
    const momentPhotos = [
      { sceneId: "a", momentId: "before", mediaId: "before-a", headingOffsetDeg: 12 },
      { sceneId: "b", momentId: "before", mediaId: "before-b", headingOffsetDeg: 0 },
    ];
    const tour = tourOf(buildTour(input({ moments, momentPhotos, media: mediaMap })));
    expect(tour.timeline?.map((m) => m.label)).toEqual(["Before", "After"]);
    expect(tour.scenes.find((s) => s.id === "a")?.moments).toEqual([
      { momentId: "before", panorama: "pano:p/before-a", headingOffsetDeg: 12 },
    ]);
    expect(tour.scenes.find((s) => s.id === "b")?.moments).toBeUndefined();
  });
});

describe("buildTour: floors", () => {
  const floorPlans = [
    { id: "up", label: "Upstairs", sortOrder: 1, mediaId: "plan-up" },
    { id: "ground", label: "Ground floor", sortOrder: 0, mediaId: "plan-ground" },
    { id: "basement", label: "Basement", sortOrder: 2, mediaId: "plan-basement" },
  ];
  const scenes = [
    scene("a", { floorPlanId: "ground", mapX: 0.5, mapY: 0.5 }),
    scene("b", { floorPlanId: "up", mapX: 0.2, mapY: 0.8 }),
    scene("c", { floorPlanId: "basement" }),
  ];
  const mediaMap = new Map<string, MediaInfo>([
    ...scenes.map((s) => [s.panoramaMediaId, media(`p/${s.id}`)] as const),
    ["plan-ground", media("f/ground", { kind: "floor_plan", width: 3200, height: 2000 })],
    ["plan-up", media("f/up", { kind: "floor_plan", width: 1000, height: 800 })],
    ["plan-basement", media("f/basement", { kind: "floor_plan", width: 1000, height: 1000 })],
  ]);

  it("lists floors with a pinned room, in floor order, at delivered size", () => {
    const tour = tourOf(buildTour(input({ scenes, floorPlans, media: mediaMap })));
    expect(tour.floorPlans).toEqual([
      { id: "ground", label: "Ground floor", imageUrl: "plan:f/ground", width: 1600, height: 1000 },
      { id: "up", label: "Upstairs", imageUrl: "plan:f/up", width: 1000, height: 800 },
    ]);
  });

  it("keeps a room's floor but no pin when it is not placed", () => {
    const tour = tourOf(buildTour(input({ scenes, floorPlans, media: mediaMap })));
    expect(tour.scenes.find((s) => s.id === "c")).toMatchObject({ floorPlanId: "basement", mapPosition: undefined });
  });

  it("drops a floor whose image has no known size, and its rooms' pins", () => {
    const broken = new Map(mediaMap);
    broken.set("plan-up", media("f/up", { kind: "floor_plan", width: null, height: null }));
    const tour = tourOf(buildTour(input({ scenes, floorPlans, media: broken })));
    expect(tour.floorPlans?.map((p) => p.id)).toEqual(["ground"]);
    expect(tour.scenes.find((s) => s.id === "b")).toMatchObject({ floorPlanId: undefined, mapPosition: undefined });
  });

  it("has no floorPlans when nothing is pinned", () => {
    const tour = tourOf(buildTour(input()));
    expect(tour.floorPlans).toBeUndefined();
  });
});
