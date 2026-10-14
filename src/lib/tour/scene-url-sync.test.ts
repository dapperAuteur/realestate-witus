// Ported from wanderlearn-app src/lib/scene-url-sync.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import { planSceneUrl, sceneFromUrl } from "./scene-url-sync";

const BASE = "https://wanderlust.witus.online/en/tours/mucho";
const IDS = ["scene-a", "scene-b", "scene-c"];

describe("planSceneUrl", () => {
  it("replaces on the first sync so the first Back press is not spent going nowhere", () => {
    expect(planSceneUrl(BASE, "scene-a", "push", false)).toEqual({
      kind: "replace",
      url: `${BASE}?scene=scene-a`,
    });
  });

  it("pushes on later scenes so Back walks back through them", () => {
    expect(planSceneUrl(`${BASE}?scene=scene-a`, "scene-b", "push", true)).toEqual({
      kind: "push",
      url: `${BASE}?scene=scene-b`,
    });
  });

  it("never pushes in replace mode, however far the visitor walks", () => {
    expect(planSceneUrl(`${BASE}?scene=scene-a`, "scene-b", "replace", true)).toEqual({
      kind: "replace",
      url: `${BASE}?scene=scene-b`,
    });
  });

  it("does nothing when the URL already names this scene", () => {
    // The chooser-grid path: the router already navigated to ?scene=. Writing
    // again would replace that entry and strand the chooser behind Back.
    expect(planSceneUrl(`${BASE}?scene=scene-b`, "scene-b", "push", true)).toEqual({ kind: "none" });
    expect(planSceneUrl(`${BASE}?scene=scene-b`, "scene-b", "push", false)).toEqual({ kind: "none" });
  });

  it("keeps other query params, so ?start=1 still skips the chooser on refresh", () => {
    const action = planSceneUrl(`${BASE}?start=1`, "scene-a", "push", false);
    expect(action.kind).toBe("replace");
    const url = new URL((action as { url: string }).url);
    expect(url.searchParams.get("start")).toBe("1");
    expect(url.searchParams.get("scene")).toBe("scene-a");
  });

  it("keeps the preview token, so a draft tour does not lose access on the second scene", () => {
    const action = planSceneUrl(`${BASE}?preview=tok123`, "scene-b", "push", true);
    const url = new URL((action as { url: string }).url);
    expect(url.searchParams.get("preview")).toBe("tok123");
  });

  it("replaces rather than appends a stale scene param", () => {
    const action = planSceneUrl(`${BASE}?scene=scene-a`, "scene-b", "push", true);
    expect((action as { url: string }).url).toBe(`${BASE}?scene=scene-b`);
    expect((action as { url: string }).url).not.toContain("scene-a");
  });

  it("does nothing rather than throwing on an unparseable URL", () => {
    expect(planSceneUrl("not a url", "scene-a", "push", false)).toEqual({ kind: "none" });
  });
});

describe("sceneFromUrl", () => {
  it("reads the scene a popped entry asks for", () => {
    expect(sceneFromUrl(`${BASE}?scene=scene-b`, IDS)).toBe("scene-b");
  });

  it("returns null with no scene param, so the caller falls back to the start scene", () => {
    expect(sceneFromUrl(BASE, IDS)).toBeNull();
    expect(sceneFromUrl(`${BASE}?start=1`, IDS)).toBeNull();
  });

  it("rejects a scene this tour does not have", () => {
    // A link from before a scene was deleted, or a hand-edited URL. Handing
    // this to setCurrentNode would leave the viewer on a node PSV cannot load.
    expect(sceneFromUrl(`${BASE}?scene=deleted-scene`, IDS)).toBeNull();
  });

  it("returns null rather than throwing on an unparseable URL", () => {
    expect(sceneFromUrl("not a url", IDS)).toBeNull();
  });
});
