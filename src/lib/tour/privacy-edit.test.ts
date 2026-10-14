// Ported from wanderlearn-app src/lib/privacy-edit.test.ts @ c7f5616, 2026-10-14
// (plans/08). The generative cases stay behind with that feature; the patch
// cases followed with the patch, from @ 63af5fe.
import { describe, expect, it } from "vitest";
import {
  PRIVACY_MAX_BOXES,
  boxContains,
  boxRects,
  emptyPrivacyRecipe,
  isPrivacyRecipeEmpty,
  layerId,
  parsePrivacyRecipe,
  privacyTransformation,
  relativeValue,
  type PrivacyRecipe,
} from "./privacy-edit";

function recipe(partial: Partial<PrivacyRecipe>): PrivacyRecipe {
  return { ...emptyPrivacyRecipe(), ...partial };
}

describe("relativeValue", () => {
  it("writes fractions with a decimal point, to the two places Cloudinary keeps", () => {
    expect(relativeValue(0.25)).toBe("0.25");
    expect(relativeValue(1)).toBe("1.0");
    expect(relativeValue(0)).toBe("0");
    expect(relativeValue(0.00001)).toBe("0");
  });
});

describe("boxRects", () => {
  it("keeps a box in the middle as one rectangle", () => {
    const [rect, ...rest] = boxRects({ u: 0.5, v: 0.5, w: 0.1, h: 0.2 });
    expect(rest).toEqual([]);
    expect(rect.x).toBeCloseTo(0.45, 9);
    expect(rect.y).toBeCloseTo(0.4, 9);
  });

  it("splits a box that crosses the left edge into two", () => {
    const rects = boxRects({ u: 0.02, v: 0.5, w: 0.1, h: 0.2 });
    expect(rects).toHaveLength(2);
    expect(rects[0].x).toBeCloseTo(0.97, 9);
    expect(rects[1]).toMatchObject({ x: 0 });
    expect(rects[1].w).toBeCloseTo(0.07, 9);
  });

  it("splits a box that crosses the right edge into two", () => {
    const rects = boxRects({ u: 0.99, v: 0.5, w: 0.1, h: 0.2 });
    expect(rects).toHaveLength(2);
    expect(rects[0].w).toBeCloseTo(0.06, 9);
    expect(rects[1].w).toBeCloseTo(0.04, 9);
  });

  it("clamps at the top and bottom instead of wrapping", () => {
    const [rect] = boxRects({ u: 0.5, v: 0.95, w: 0.1, h: 0.2 });
    expect(rect.y).toBeCloseTo(0.85, 9);
    expect(rect.h).toBeCloseTo(0.15, 9);
  });
});

describe("privacyTransformation", () => {
  it("is empty for an empty recipe", () => {
    expect(privacyTransformation(emptyPrivacyRecipe())).toEqual([]);
    expect(isPrivacyRecipeEmpty(emptyPrivacyRecipe())).toBe(true);
  });

  it("detects faces before any box changes the pixels", () => {
    const tx = privacyTransformation(recipe({ faces: "pixelate", boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.1, h: 0.2 }] }));
    expect(tx[0]).toBe("e_pixelate_faces:30");
    expect(tx[1]).toBe("e_pixelate_region:40,x_0.45,y_0.40,w_0.10,h_0.20");
  });

  it("uses the blur effect when the box style is blur", () => {
    expect(privacyTransformation(recipe({ boxStyle: "blur", boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.1, h: 0.2 }] }))).toEqual([
      "e_blur_region:2000,x_0.45,y_0.40,w_0.10,h_0.20",
    ]);
  });

  it("emits two regions for a box across the seam", () => {
    expect(privacyTransformation(recipe({ boxes: [{ id: "a", u: 0.01, v: 0.5, w: 0.1, h: 0.2 }] }))).toHaveLength(2);
  });

  it("covers the bottom from the right line down, full width", () => {
    expect(privacyTransformation(recipe({ bottom: { mode: "blur", angleDeg: 36 } }))).toEqual(["e_blur_region:2000,y_0.80"]);
    expect(privacyTransformation(recipe({ bottom: { mode: "pixelate", angleDeg: 36 } }))).toEqual([
      "e_pixelate_region:60,y_0.80",
    ]);
  });

  it("writes box regions in whole pixels when the photo's size is known", () => {
    const tx = privacyTransformation(recipe({ boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.0444, h: 0.25 }] }), {
      imageSize: { width: 3000, height: 1500 },
    });
    expect(tx).toEqual(["e_pixelate_region:40,x_1433,y_562,w_134,h_376"]);
  });

  it("rounds fractions outward when the size is unknown, so a box never shrinks", () => {
    const [tx] = privacyTransformation(recipe({ boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.0444, h: 0.25 }] }));
    expect(tx).toBe("e_pixelate_region:40,x_0.47,y_0.37,w_0.06,h_0.26");
  });

  it("covers the bottom in pixels on a 6144 x 3072 panorama", () => {
    expect(
      privacyTransformation(recipe({ bottom: { mode: "pixelate", angleDeg: 25 } }), { imageSize: { width: 6144, height: 3072 } }),
    ).toEqual(["e_pixelate_region:60,y_2645"]);
  });
});

describe("parsePrivacyRecipe", () => {
  it("accepts a recipe the editor builds", () => {
    const input = recipe({ faces: "blur", boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.1, h: 0.2 }] });
    expect(parsePrivacyRecipe(input)).toEqual({ ok: true, data: input });
  });

  it("rejects more boxes than the URL can carry", () => {
    const boxes = Array.from({ length: PRIVACY_MAX_BOXES + 1 }, (_, i) => ({ id: `b${i}`, u: 0.5, v: 0.5, w: 0.05, h: 0.05 }));
    expect(parsePrivacyRecipe(recipe({ boxes }))).toMatchObject({ ok: false, code: "PRIVACY_BOXES" });
  });

  it("rejects a box too small to hide anything, and anything generative", () => {
    expect(parsePrivacyRecipe(recipe({ boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.001, h: 0.2 }] })).ok).toBe(false);
    expect(parsePrivacyRecipe({ ...recipe({}), boxStyle: "remove" }).ok).toBe(false);
    expect(parsePrivacyRecipe("garbage").ok).toBe(false);
  });

  it("drops fields that are not part of the shape", () => {
    const result = parsePrivacyRecipe({ ...recipe({}), removeAllPeople: true });
    expect(result.ok && "removeAllPeople" in result.data).toBe(false);
  });
});

describe("boxContains", () => {
  it("finds a click inside a box, including across the seam", () => {
    const box = { id: "a", u: 0.01, v: 0.5, w: 0.1, h: 0.2 };
    expect(boxContains(box, 0.98, 0.5)).toBe(true);
    expect(boxContains(box, 0.05, 0.5)).toBe(true);
    expect(boxContains(box, 0.5, 0.5)).toBe(false);
  });
});

describe("the floor patch", () => {
  const patched = (angleDeg: number) =>
    recipe({ bottom: { mode: "patch", angleDeg, patch: { color: "#000000", logoMediaId: null } } });

  it("lays the painted strip over the bottom, sized relative to the photo", () => {
    expect(privacyTransformation(patched(27), { patchPublicId: "realestate-witus/t/privacy-patches/abc" })).toEqual([
      "l_realestate-witus:t:privacy-patches:abc",
      "c_scale,fl_relative,w_1.0,h_0.15",
      "fl_layer_apply,g_south",
    ]);
  });

  it("sizes the patch in pixels, rounded up rather than down", () => {
    const tx = privacyTransformation(patched(25), { patchPublicId: "p", imageSize: { width: 5900, height: 2950 } });
    expect(tx[1]).toBe("c_scale,w_5900,h_410");
  });

  it("skips a patch whose strip was never uploaded rather than emit a broken layer", () => {
    expect(privacyTransformation(patched(27))).toEqual([]);
  });

  it("parses a patch's color and logo, and refuses a bad one", () => {
    const logo = "0b8f0d5e-5d0a-4c55-9a43-1f2d3c4b5a69";
    const parsed = parsePrivacyRecipe({ ...emptyPrivacyRecipe(), bottom: { mode: "patch", angleDeg: 25, patch: { color: "#1E293B", logoMediaId: logo } } });
    expect(parsed).toMatchObject({ ok: true, data: { bottom: { mode: "patch", patch: { color: "#1e293b", logoMediaId: logo } } } });
    expect(
      parsePrivacyRecipe({ ...emptyPrivacyRecipe(), bottom: { mode: "patch", angleDeg: 25, patch: { color: "#000000", logoMediaId: null, builtinLogo: "witus" } } }),
    ).toMatchObject({ ok: true, data: { bottom: { patch: { builtinLogo: "witus" } } } });
    for (const patch of [
      undefined,
      { color: "red", logoMediaId: null },
      { color: "#000000", logoMediaId: "x" },
      { color: "#000000", logoMediaId: null, builtinLogo: "acme" },
      { color: "#000000", logoMediaId: logo, builtinLogo: "witus" },
    ]) {
      expect(parsePrivacyRecipe({ ...emptyPrivacyRecipe(), bottom: { mode: "patch", angleDeg: 25, patch } }).ok).toBe(false);
    }
  });

  it("writes layer folders with colons", () => {
    expect(layerId("realestate-witus/t/x")).toBe("realestate-witus:t:x");
  });
});
