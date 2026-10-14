// Ported from wanderlearn-app src/lib/view-limit.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * The per-scene "lowest a visitor may look" limit.
 *
 * Stored as degrees below the horizon (negative), enforced in the viewer by PSV's
 * VisibleRangePlugin. Pure helpers live here so the viewer, the creator control, the
 * server action and the tests all agree on the same range and the same arithmetic.
 */

/** Furthest down a limit may be set. -90 would be no limit at all. */
export const VIEW_LIMIT_MIN_DEG = -85;
/** Highest a limit may be set: the horizon. Any higher hides the room, not the floor. */
export const VIEW_LIMIT_MAX_DEG = 0;
/**
 * Where the slider starts when a creator first turns the limit on. Roughly where the
 * operator's head sits with a selfie stick held overhead; the creator adjusts from
 * there while watching the preview.
 */
export const VIEW_LIMIT_DEFAULT_DEG = -50;

const DEG = Math.PI / 180;

/** Clamp a stored or typed value into the supported range. */
export function clampViewLimitDeg(deg: number): number {
  return Math.min(VIEW_LIMIT_MAX_DEG, Math.max(VIEW_LIMIT_MIN_DEG, deg));
}

/**
 * The VisibleRangePlugin vertical range for a scene, or null for no limit.
 *
 * Degree strings rather than radians: PSV parses "<n>deg" itself, the same form the
 * horizon roll already uses, so the stored value never needs converting at the edge.
 */
export function verticalRangeFor(
  minPitchDeg: number | null | undefined,
): [string, string] | null {
  if (minPitchDeg === null || minPitchDeg === undefined || !Number.isFinite(minPitchDeg)) {
    return null;
  }
  return [`${clampViewLimitDeg(minPitchDeg)}deg`, "90deg"];
}

/**
 * Where the camera's center may point so that nothing below the limit is on screen.
 *
 * Mirrors the vertical half of VisibleRangePlugin.__applyRanges (5.14.1): the allowed
 * range shrinks by half the vertical field of view at each end, and when the range is
 * narrower than the field of view the camera is held at its middle. Used to pre-clamp
 * the arrival heading of a scene transition, so the incoming panorama is never
 * composited looking at the part the creator hid, even for the length of the fade.
 */
export function clampPitchForViewLimit(
  pitchRad: number,
  minPitchDeg: number | null | undefined,
  vFovDeg: number,
): number {
  if (minPitchDeg === null || minPitchDeg === undefined || !Number.isFinite(minPitchDeg)) {
    return pitchRad;
  }
  const min = clampViewLimitDeg(minPitchDeg) * DEG;
  const max = Math.PI / 2;
  const vFov = vFovDeg * DEG;
  const span = max - min;
  if (span <= vFov) return min + span / 2;
  const lo = min + vFov / 2;
  const hi = max - vFov / 2;
  return Math.min(hi, Math.max(lo, pitchRad));
}
