// How big an upload may be, and what the browser should shrink it to first.
//
// BAM's Cloudinary plan caps images at 10 MB (and video at 100 MB), user task
// 13, 2026-10-14. Those are the free-plan numbers, which also cap images at 25
// megapixels. An Insta360 X5 360 photo is about 72 MP and 20 to 40 MB, so it
// can't go up as shot: the browser resizes it first. 6144 x 3072 (19 MP) is
// what phones are sent anyway (src/lib/listings/queries.ts caps delivery at
// 6144), so the buyer loses nothing.
//
// Pure: the uploader does the canvas work, this decides the numbers.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_MEGAPIXELS = 25;

export type ResizeKind = "photo" | "panorama" | "floor_plan" | "logo";

/** Longest edge per kind. Panoramas are measured by width (they are 2:1). */
export const MAX_EDGE: Record<ResizeKind, number> = {
  panorama: 6144,
  photo: 3200,
  floor_plan: 2400,
  // Painted into a floor patch at 512 px at most; 1024 leaves room for later uses.
  logo: 1024,
};

/** iOS Safari refuses canvases over 16,777,216 pixels; 4096 x 2048 stays well inside. */
export const IOS_MAX_PANORAMA_WIDTH = 4096;

export interface ResizeInput {
  width: number;
  height: number;
  bytes: number;
  type: string;
}

export type ResizePlan =
  | { action: "keep" }
  | { action: "resize"; width: number; height: number; type: "image/jpeg" | "image/png"; quality: number }
  | { action: "refuse"; reason: "type" | "dimensions" };

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * What to do with an image before upload. Keeps it untouched when it is
 * already within size and pixels (no needless re-encode); otherwise scales
 * it so its longest edge fits the kind's cap, keeping the aspect ratio
 * exactly (a panorama must stay 2:1).
 */
export function planResize(input: ResizeInput, kind: ResizeKind, opts: { ios?: boolean } = {}): ResizePlan {
  if (!ACCEPTED.has(input.type)) return { action: "refuse", reason: "type" };
  if (!(input.width > 0) || !(input.height > 0)) return { action: "refuse", reason: "dimensions" };

  const cap = kind === "panorama" && opts.ios ? IOS_MAX_PANORAMA_WIDTH : MAX_EDGE[kind];
  const longest = kind === "panorama" ? input.width : Math.max(input.width, input.height);
  const megapixels = (input.width * input.height) / 1_000_000;
  const fits = longest <= cap && input.bytes <= MAX_UPLOAD_BYTES && megapixels <= MAX_UPLOAD_MEGAPIXELS;
  if (fits) return { action: "keep" };

  const scale = Math.min(1, cap / longest);
  const width = Math.max(1, Math.round(input.width * scale));
  const height = Math.max(1, Math.round(input.height * scale));
  // Line drawings stay PNG (crisp edges), and logos always become PNG (a
  // transparent background must stay transparent); photographs become JPEG.
  const type =
    kind === "logo" || (kind === "floor_plan" && input.type === "image/png") ? "image/png" : "image/jpeg";
  return { action: "resize", width, height, type, quality: 0.88 };
}

/** If an encode still comes out too big: lower quality first, then 85% of the size. */
export function nextAttempt(
  plan: Extract<ResizePlan, { action: "resize" }>,
): Extract<ResizePlan, { action: "resize" }> | null {
  if (plan.type === "image/jpeg" && plan.quality > 0.72) {
    return { ...plan, quality: Math.round((plan.quality - 0.08) * 100) / 100 };
  }
  const width = Math.round(plan.width * 0.85);
  const height = Math.round(plan.height * 0.85);
  if (width < 1024) return null;
  return { ...plan, width, height, type: "image/jpeg", quality: 0.82 };
}
