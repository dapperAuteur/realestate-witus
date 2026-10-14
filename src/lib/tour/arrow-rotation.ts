// Ported from wanderlearn-app src/lib/arrow-rotation.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * Scene-link arrow rotation: whole degrees, clockwise, in 15° steps, kept in
 * 0..345 so "turn left from 0" lands on 345 rather than -15.
 */

export const ARROW_ROTATION_STEP = 15;
export const ARROW_ROTATION_MAX = 360 - ARROW_ROTATION_STEP;

/** Turns `current` by `delta` degrees and wraps the result into 0..345. */
export function rotateArrow(current: number, delta: number): number {
  return (((current + delta) % 360) + 360) % 360;
}

export function isValidArrowRotation(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= ARROW_ROTATION_MAX &&
    value % ARROW_ROTATION_STEP === 0
  );
}
