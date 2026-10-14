// Ported from wanderlearn-app src/lib/privacy-edit.ts @ c7f5616, 2026-10-14
// (plans/08 phase D, "hide people and gear"). Manual tools only: automatic
// face blur or pixelation, boxes the editor draws, and a cover over the floor
// under the tripod. Left out on purpose:
// - generative "remove people" (plans/08 non-goal: no AI-made pixels reach buyers)
// - the painted logo patch (it needs a browser-painted upload; later)
// The zod schemas became parsePrivacyRecipe: this repo validates by hand.
//
// Coordinates are normalized to the equirectangular image (u across from the
// left edge, v down from the top), so a recipe survives any resize. Region
// effects are written in WHOLE PIXELS of the photo being edited: Cloudinary
// keeps only two decimal places of a fraction, which once moved every box by
// up to 1% of the photo (Wanderlust improvement 41, verified on the live
// account). Fractions remain the fallback, rounded outward so a box never
// covers less than was drawn.

import { err, ok, type Result } from "@/lib/result";

export const PRIVACY_MAX_BOXES = 24;
/** Smallest box side, as a share of the image. Below this a box hides nothing. */
export const PRIVACY_MIN_BOX = 0.005;
/** Widest box: a third of the way round. */
export const PRIVACY_MAX_BOX_W = 1 / 3;
/** A new box: about 16 degrees wide and 45 tall, a standing adult a few meters off. */
export const PRIVACY_DEFAULT_BOX = { w: 16 / 360, h: 45 / 180 } as const;

export const PRIVACY_BOTTOM_MIN_DEG = 5;
export const PRIVACY_BOTTOM_MAX_DEG = 60;
export const PRIVACY_BOTTOM_DEFAULT_DEG = 25;

/**
 * Fixed strengths, not sliders: on full-resolution panoramas a gentle setting
 * leaves a face readable, and nobody protecting a person should have to learn that.
 */
export const PRIVACY_STRENGTH = {
  faceBlur: 1500,
  facePixelate: 30,
  boxBlur: 2000,
  boxPixelate: 40,
  bottomBlur: 2000,
  bottomPixelate: 60,
} as const;

export interface PrivacyBox {
  id: string;
  /** Center, across. Past an edge, a box wraps round the seam. */
  u: number;
  /** Center, down. */
  v: number;
  w: number;
  h: number;
}

export interface PrivacyRecipe {
  faces: "off" | "blur" | "pixelate";
  boxes: PrivacyBox[];
  boxStyle: "blur" | "pixelate";
  bottom: { mode: "off" | "blur" | "pixelate"; angleDeg: number };
}

export function emptyPrivacyRecipe(): PrivacyRecipe {
  return { faces: "off", boxes: [], boxStyle: "pixelate", bottom: { mode: "off", angleDeg: PRIVACY_BOTTOM_DEFAULT_DEG } };
}

export function isPrivacyRecipeEmpty(recipe: PrivacyRecipe): boolean {
  return recipe.faces === "off" && recipe.boxes.length === 0 && recipe.bottom.mode === "off";
}

const inRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

/** Validates a recipe from the editor or the database. */
export function parsePrivacyRecipe(input: unknown): Result<PrivacyRecipe> {
  const bad = err("PRIVACY_RECIPE", "That edit couldn't be read. Reload and try again.");
  if (!input || typeof input !== "object") return bad;
  const raw = input as Record<string, unknown>;
  const faces = raw.faces;
  if (faces !== "off" && faces !== "blur" && faces !== "pixelate") return bad;
  const boxStyle = raw.boxStyle;
  if (boxStyle !== "blur" && boxStyle !== "pixelate") return bad;
  const bottom = raw.bottom as Record<string, unknown> | undefined;
  if (!bottom || (bottom.mode !== "off" && bottom.mode !== "blur" && bottom.mode !== "pixelate")) return bad;
  if (!inRange(bottom.angleDeg, PRIVACY_BOTTOM_MIN_DEG, PRIVACY_BOTTOM_MAX_DEG)) return bad;
  if (!Array.isArray(raw.boxes) || raw.boxes.length > PRIVACY_MAX_BOXES) {
    return err("PRIVACY_BOXES", `At most ${PRIVACY_MAX_BOXES} boxes on one photo.`);
  }
  const boxes: PrivacyBox[] = [];
  for (const item of raw.boxes) {
    const box = item as Record<string, unknown>;
    if (
      typeof box?.id !== "string" ||
      box.id.length < 1 ||
      box.id.length > 40 ||
      !inRange(box.u, 0, 1) ||
      !inRange(box.v, 0, 1) ||
      !inRange(box.w, PRIVACY_MIN_BOX, PRIVACY_MAX_BOX_W) ||
      !inRange(box.h, PRIVACY_MIN_BOX, 1)
    ) {
      return bad;
    }
    boxes.push({ id: box.id, u: box.u, v: box.v, w: box.w, h: box.h });
  }
  return ok({ faces, boxes, boxStyle, bottom: { mode: bottom.mode, angleDeg: bottom.angleDeg } });
}

export type NormalizedRect = { x: number; y: number; w: number; h: number };

/**
 * The rectangle(s) a box covers. Past the left or right edge a box continues
 * on the other side (those edges are the same line in the room), so it becomes
 * two rectangles. Top and bottom clamp: past the top there is only the pole.
 */
export function boxRects(box: Pick<PrivacyBox, "u" | "v" | "w" | "h">): NormalizedRect[] {
  const w = Math.min(box.w, PRIVACY_MAX_BOX_W);
  const y0 = Math.max(0, box.v - box.h / 2);
  const y1 = Math.min(1, box.v + box.h / 2);
  const h = y1 - y0;
  const x0 = box.u - w / 2;
  const x1 = box.u + w / 2;
  if (x0 < 0) {
    return [
      { x: x0 + 1, y: y0, w: -x0, h },
      { x: 0, y: y0, w: x1, h },
    ];
  }
  if (x1 > 1) {
    return [
      { x: x0, y: y0, w: 1 - x0, h },
      { x: 0, y: y0, w: x1 - 1, h },
    ];
  }
  return [{ x: x0, y: y0, w, h }];
}

/** A fraction Cloudinary reads as relative: a decimal point, two places; 1 is "1.0". */
export function relativeValue(n: number): string {
  if (!(n >= 0.005)) return "0";
  if (n >= 1) return "1.0";
  return n.toFixed(2);
}

const floorHundredth = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
const ceilHundredth = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;
const floorPx = (n: number) => Math.floor(n + 1e-6);
const ceilPx = (n: number) => Math.ceil(n - 1e-6);

type PixelSize = { width: number; height: number };

/** A rectangle in whole pixels, grown outward to pixel edges, kept inside the photo. */
function pixelRect(rect: NormalizedRect, size: PixelSize) {
  const x = Math.max(0, floorPx(rect.x * size.width));
  const y = Math.max(0, floorPx(rect.y * size.height));
  const right = Math.min(size.width, ceilPx((rect.x + rect.w) * size.width));
  const bottom = Math.min(size.height, ceilPx((rect.y + rect.h) * size.height));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function regionParams(rect: NormalizedRect, size: PixelSize | undefined): string {
  if (size) {
    const r = pixelRect(rect, size);
    return `x_${r.x},y_${r.y},w_${r.w},h_${r.h}`;
  }
  const x0 = Math.max(0, floorHundredth(rect.x));
  const y0 = Math.max(0, floorHundredth(rect.y));
  const x1 = Math.min(1, ceilHundredth(rect.x + rect.w));
  const y1 = Math.min(1, ceilHundredth(rect.y + rect.h));
  return `x_${relativeValue(x0)},y_${relativeValue(y0)},w_${relativeValue(x1 - x0)},h_${relativeValue(y1 - y0)}`;
}

/**
 * The recipe as ordered Cloudinary transformation components, one URL path
 * segment each. Faces first (detected on the untouched photo, before a box
 * blurs one the detector could have found), then boxes, then the floor cover.
 */
export function privacyTransformation(recipe: PrivacyRecipe, options: { imageSize?: PixelSize } = {}): string[] {
  const out: string[] = [];
  if (recipe.faces === "blur") out.push(`e_blur_faces:${PRIVACY_STRENGTH.faceBlur}`);
  if (recipe.faces === "pixelate") out.push(`e_pixelate_faces:${PRIVACY_STRENGTH.facePixelate}`);

  const size = options.imageSize && options.imageSize.width > 0 && options.imageSize.height > 0 ? options.imageSize : undefined;
  const boxEffect =
    recipe.boxStyle === "blur" ? `e_blur_region:${PRIVACY_STRENGTH.boxBlur}` : `e_pixelate_region:${PRIVACY_STRENGTH.boxPixelate}`;
  for (const box of recipe.boxes) {
    for (const rect of boxRects(box)) out.push(`${boxEffect},${regionParams(rect, size)}`);
  }

  // y alone: from that line down, full width; rounded up the photo, so the
  // cover reaches at least as high as the line the editor showed.
  const coverShare = recipe.bottom.angleDeg / 180;
  const coverTop = size
    ? `y_${Math.max(0, floorPx((1 - coverShare) * size.height))}`
    : `y_${relativeValue(floorHundredth(1 - coverShare))}`;
  if (recipe.bottom.mode === "blur") out.push(`e_blur_region:${PRIVACY_STRENGTH.bottomBlur},${coverTop}`);
  if (recipe.bottom.mode === "pixelate") out.push(`e_pixelate_region:${PRIVACY_STRENGTH.bottomPixelate},${coverTop}`);
  return out;
}

/** True when the point is inside the box, seam included. For the editor's click-to-select. */
export function boxContains(box: PrivacyBox, u: number, v: number): boolean {
  return boxRects(box).some((r) => u >= r.x && u <= r.x + r.w && v >= r.y && v <= r.y + r.h);
}
