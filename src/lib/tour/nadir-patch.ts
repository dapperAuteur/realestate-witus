// Ported from wanderlearn-app src/lib/nadir-patch.ts @ 63af5fe, 2026-10-14
// (plans/08: "the painted logo patch for the floor"). Unchanged but for this
// header and American spelling.

/**
 * The bottom patch: a solid disc, optionally carrying a logo, that covers the floor
 * directly under a 360 camera.
 *
 * In an equirectangular image the area under the camera is the bottom strip, stretched
 * the full width: every column is one direction, every row one distance from straight
 * down. So a disc on the floor is drawn as that strip, with the logo unwrapped around
 * the nadir. Cloudinary then lays the strip over the bottom of the photo
 * (see privacyTransformation). Painted in the browser because Cloudinary has no polar
 * unwrap, and a strip a couple of thousand pixels wide is cheap for any phone.
 *
 * Orientation: yaw 0 (the middle column) is "forward". Looking straight down, forward is
 * the top of the screen and yaw +90 is the right, so the logo reads upright and
 * unmirrored for a visitor facing the scene's forward direction.
 */

/** Width of the painted strip. Small enough to post (well under 1 MB as JPEG). */
export const NADIR_PATCH_WIDTH = 2048;
/** Half the logo's side, as a share of the disc radius: the logo sits inside the disc. */
export const NADIR_LOGO_HALF = 0.6;

/** Strip size for a cover of `angleDeg` up from straight down. Same aspect as the photo's strip. */
export function nadirPatchSize(angleDeg: number, width = NADIR_PATCH_WIDTH): { width: number; height: number } {
  return { width, height: Math.max(1, Math.round((width * angleDeg) / 360)) };
}

/**
 * Where a strip pixel lands on the disc: (lx, ly) in units of the disc radius, x to the
 * right and y toward forward, as seen looking straight down. r is the distance from the
 * nadir (0) to the disc's edge (1).
 */
export function nadirDiscPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): { lx: number; ly: number; r: number } {
  const phi = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
  const r = 1 - (y + 0.5) / height;
  return { lx: r * Math.sin(phi), ly: r * Math.cos(phi), r };
}

/** Logo pixel for a disc point, or null when the point is outside the logo's box. */
export function logoSourcePoint(
  lx: number,
  ly: number,
  logoWidth: number,
  logoHeight: number,
): { px: number; py: number } | null {
  const longest = Math.max(logoWidth, logoHeight);
  const ax = (NADIR_LOGO_HALF * logoWidth) / longest;
  const ay = (NADIR_LOGO_HALF * logoHeight) / longest;
  if (Math.abs(lx) > ax || Math.abs(ly) > ay) return null;
  return {
    px: ((lx / ax + 1) / 2) * (logoWidth - 1),
    py: ((1 - ly / ay) / 2) * (logoHeight - 1),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Paint the patch strip and return it as a JPEG data URL. Browser only.
 *
 * `logo` must already be loaded, and loaded with crossOrigin="anonymous" or the canvas
 * is tainted and cannot be read back. Cloudinary sends Access-Control-Allow-Origin: *.
 */
export function paintNadirPatch(options: {
  color: string;
  angleDeg: number;
  logo?: HTMLImageElement | null;
}): string {
  const { width, height } = nadirPatchSize(options.angleDeg);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const [br, bg, bb] = hexToRgb(options.color);
  const out = ctx.createImageData(width, height);

  let logoPixels: Uint8ClampedArray | null = null;
  let lw = 0;
  let lh = 0;
  if (options.logo && options.logo.naturalWidth > 0) {
    const scale = Math.min(1, 512 / Math.max(options.logo.naturalWidth, options.logo.naturalHeight));
    lw = Math.max(1, Math.round(options.logo.naturalWidth * scale));
    lh = Math.max(1, Math.round(options.logo.naturalHeight * scale));
    const lc = document.createElement("canvas");
    lc.width = lw;
    lc.height = lh;
    const lctx = lc.getContext("2d");
    if (lctx) {
      lctx.drawImage(options.logo, 0, 0, lw, lh);
      logoPixels = lctx.getImageData(0, 0, lw, lh).data;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = br;
      let g = bg;
      let b = bb;
      if (logoPixels) {
        const { lx, ly } = nadirDiscPoint(x, y, width, height);
        const src = logoSourcePoint(lx, ly, lw, lh);
        if (src) {
          // Bilinear sample, then alpha over the background color.
          const x0 = Math.floor(src.px);
          const y0 = Math.floor(src.py);
          const x1 = Math.min(lw - 1, x0 + 1);
          const y1 = Math.min(lh - 1, y0 + 1);
          const fx = src.px - x0;
          const fy = src.py - y0;
          const sample = (c: number) => {
            const p00 = logoPixels![(y0 * lw + x0) * 4 + c];
            const p10 = logoPixels![(y0 * lw + x1) * 4 + c];
            const p01 = logoPixels![(y1 * lw + x0) * 4 + c];
            const p11 = logoPixels![(y1 * lw + x1) * 4 + c];
            return (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
          };
          const a = sample(3) / 255;
          r = sample(0) * a + br * (1 - a);
          g = sample(1) * a + bg * (1 - a);
          b = sample(2) * a + bb * (1 - a);
        }
      }
      const i = (y * width + x) * 4;
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}
