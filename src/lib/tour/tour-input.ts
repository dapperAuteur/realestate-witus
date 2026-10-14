// Pure rules for what the tour editor may save (plans/08 phase D). The
// viewer reports angles in radians; these keep them in range so a bad click
// or a hand-edited request can never store a position PSV would throw on.

import { clampViewLimitDeg } from "./view-limit";

const TAU = Math.PI * 2;

/** Yaw wrapped into (-PI, PI]. */
export function normalizeYaw(yaw: number): number {
  let wrapped = ((yaw % TAU) + TAU) % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  return wrapped;
}

/** A yaw/pitch pair from untrusted input, or null when it isn't one. */
export function parsePosition(yaw: unknown, pitch: unknown): { yaw: number; pitch: number } | null {
  const y = Number(yaw);
  const p = Number(pitch);
  if (!Number.isFinite(y) || !Number.isFinite(p)) return null;
  return { yaw: normalizeYaw(y), pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p)) };
}

export const ROLL_LIMIT_DEG = 15;

/** Horizon roll in degrees, clamped to the editor's range; null clears it. */
export function parseRoll(value: unknown): number | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.max(-ROLL_LIMIT_DEG, Math.min(ROLL_LIMIT_DEG, n));
  return clamped === 0 ? null : Math.round(clamped * 10) / 10;
}

/** The view limit in degrees (-85..0); null removes it. */
export function parseViewLimit(value: unknown): number | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(clampViewLimitDeg(n));
}

/** A pin on a floor plan, normalized to 0..1. */
export function parsePlanPoint(x: unknown, y: unknown): { x: number; y: number } | null {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 10000) / 10000;
  return { x: clamp(px), y: clamp(py) };
}

/**
 * A starting room name from an upload's filename: "living-room.jpg" becomes
 * "Living room". Camera names ("IMG_20260712_101530_00_123.insp",
 * "PANO0001.jpg") say nothing about the room, so those become "Room N" for a
 * person to rename. Never guessed from the image (no AI content).
 */
export function sceneNameFromFile(filename: string, index: number): string {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  const words = base.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  const letters = words.replace(/[^a-zA-Z]/g, "");
  const looksLikeCamera =
    // A camera prefix runs straight into digits ("PANO0001", "R0010023"), so a
    // lookahead, not a word boundary. "Rooftop" doesn't match: "r" must be
    // followed by a digit or a space.
    /^(img|vid|pano|dsc|dji|gopr|insta360|mvimg|pxl|r)(?=[\s\d]|$)/i.test(words) ||
    letters.length < 3 ||
    /\d{6,}/.test(words);
  if (!words || looksLikeCamera) return `Room ${index + 1}`;
  const name = words.toLowerCase();
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 80);
}

/** An equirectangular 360 photo is twice as wide as it is tall (a small tolerance for odd exports). */
export function looksEquirectangular(width: number | null | undefined, height: number | null | undefined): boolean {
  if (!width || !height) return false;
  return Math.abs(width / height - 2) <= 0.02;
}
