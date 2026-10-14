// Ported from wanderlearn-app src/lib/nadir-patch.test.ts @ 63af5fe, 2026-10-14.
import { describe, expect, it } from "vitest";
import { NADIR_LOGO_HALF, logoSourcePoint, nadirDiscPoint, nadirPatchSize } from "./nadir-patch";

describe("nadirPatchSize", () => {
  it("keeps the photo strip's aspect: 360 degrees across, the cover angle down", () => {
    expect(nadirPatchSize(30, 2048)).toEqual({ width: 2048, height: 171 });
    expect(nadirPatchSize(60, 2048)).toEqual({ width: 2048, height: 341 });
  });
});

describe("nadirDiscPoint", () => {
  it("puts the bottom row at the nadir and the top row at the disc's edge", () => {
    expect(nadirDiscPoint(1024, 1000, 2048, 1000).r).toBeCloseTo(0, 2);
    expect(nadirDiscPoint(1024, 0, 2048, 1000).r).toBeCloseTo(1, 2);
  });

  it("maps the middle column to forward, the top of the screen looking down", () => {
    const p = nadirDiscPoint(1023.5, 0, 2048, 1000);
    expect(p.lx).toBeCloseTo(0, 3);
    expect(p.ly).toBeGreaterThan(0.99);
  });

  it("maps three quarters across to the right, so a logo is not mirrored", () => {
    const p = nadirDiscPoint(1535.5, 0, 2048, 1000);
    expect(p.lx).toBeGreaterThan(0.99);
    expect(p.ly).toBeCloseTo(0, 3);
  });
});

describe("logoSourcePoint", () => {
  it("samples the logo's top edge from the forward side of the disc", () => {
    const src = logoSourcePoint(0, NADIR_LOGO_HALF, 100, 100);
    expect(src?.py).toBeCloseTo(0, 6);
    expect(src?.px).toBeCloseTo(49.5, 6);
  });

  it("leaves the background outside the logo's box", () => {
    expect(logoSourcePoint(0.9, 0, 100, 100)).toBeNull();
  });

  it("fits a wide logo by its longest side", () => {
    // 200 x 100: half-height is half the half-width.
    expect(logoSourcePoint(0, NADIR_LOGO_HALF * 0.75, 200, 100)).toBeNull();
    expect(logoSourcePoint(NADIR_LOGO_HALF * 0.75, 0, 200, 100)).not.toBeNull();
  });
});
