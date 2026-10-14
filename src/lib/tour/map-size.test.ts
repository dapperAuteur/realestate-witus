// Ported from wanderlearn-app src/lib/map-size.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import { mapSizeForViewport } from "./map-size";

describe("mapSizeForViewport", () => {
  it("is small enough on a 375px phone not to dominate the photograph", () => {
    // The old flat 180px was 48% of this screen's width.
    const px = Number(mapSizeForViewport(375).replace("px", ""));
    expect(px / 375).toBeLessThan(0.3);
  });

  it("steps up for large phones and again for desktop", () => {
    expect(mapSizeForViewport(375)).toBe("96px");
    expect(mapSizeForViewport(600)).toBe("120px");
    expect(mapSizeForViewport(1280)).toBe("150px");
  });

  it("never returns the old 180px at any width", () => {
    for (const w of [320, 375, 414, 479, 480, 767, 768, 1024, 1920, 3840]) {
      expect(mapSizeForViewport(w)).not.toBe("180px");
    }
  });

  it("is monotonic — a wider viewport never gets a smaller map", () => {
    const widths = [320, 375, 479, 480, 640, 767, 768, 1024, 1920];
    const sizes = widths.map((w) => Number(mapSizeForViewport(w).replace("px", "")));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
    }
  });

  it("returns a usable CSS length, not a bare number", () => {
    // PSV's config types `size` as a string; a number is silently ignored.
    expect(mapSizeForViewport(1000)).toMatch(/^\d+px$/);
  });

  it("handles a zero or nonsense width without throwing", () => {
    expect(mapSizeForViewport(0)).toBe("96px");
    expect(mapSizeForViewport(-1)).toBe("96px");
  });
});
