// Ported from wanderlearn-app src/lib/view-limit.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import {
  VIEW_LIMIT_MAX_DEG,
  VIEW_LIMIT_MIN_DEG,
  clampPitchForViewLimit,
  clampViewLimitDeg,
  verticalRangeFor,
} from "./view-limit";

const DEG = Math.PI / 180;

describe("verticalRangeFor", () => {
  it("returns null when there is no limit", () => {
    expect(verticalRangeFor(null)).toBeNull();
    expect(verticalRangeFor(undefined)).toBeNull();
    expect(verticalRangeFor(Number.NaN)).toBeNull();
  });

  it("runs from the limit up to straight overhead", () => {
    expect(verticalRangeFor(-50)).toEqual(["-50deg", "90deg"]);
  });

  it("clamps values outside the supported range", () => {
    expect(verticalRangeFor(-120)).toEqual([`${VIEW_LIMIT_MIN_DEG}deg`, "90deg"]);
    expect(verticalRangeFor(30)).toEqual([`${VIEW_LIMIT_MAX_DEG}deg`, "90deg"]);
  });
});

describe("clampViewLimitDeg", () => {
  it("keeps in-range values and clamps the rest", () => {
    expect(clampViewLimitDeg(-40)).toBe(-40);
    expect(clampViewLimitDeg(-89)).toBe(VIEW_LIMIT_MIN_DEG);
    expect(clampViewLimitDeg(5)).toBe(VIEW_LIMIT_MAX_DEG);
  });
});

describe("clampPitchForViewLimit", () => {
  it("leaves the pitch alone when the scene has no limit", () => {
    expect(clampPitchForViewLimit(-1.2, null, 60)).toBe(-1.2);
  });

  it("raises an arrival that would show the hidden floor", () => {
    // Limit 50 degrees down, 60 degree field of view: the center may go no lower than
    // -50 + 30 = -20 degrees, so the bottom edge of the screen stays at -50.
    const pitch = clampPitchForViewLimit(-45 * DEG, -50, 60);
    expect(pitch / DEG).toBeCloseTo(-20, 6);
  });

  it("does not move an arrival that is already within the limit", () => {
    expect(clampPitchForViewLimit(-10 * DEG, -50, 60)).toBeCloseTo(-10 * DEG, 9);
  });

  it("caps the top the same way the plugin does", () => {
    expect(clampPitchForViewLimit(89 * DEG, -50, 60) / DEG).toBeCloseTo(60, 6);
  });

  it("holds the middle when the allowed band is narrower than the view", () => {
    // Horizon limit with a 100 degree field of view: 90 degrees of band, so the camera
    // sits at its middle, 45 degrees up.
    expect(clampPitchForViewLimit(0, 0, 100) / DEG).toBeCloseTo(45, 6);
  });
});
