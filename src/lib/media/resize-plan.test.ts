import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, nextAttempt, planResize, type ResizePlan } from "./resize-plan";

const MB = 1024 * 1024;

describe("planResize", () => {
  it("shrinks a full-size X5 360 photo to 6144 x 3072, still 2:1", () => {
    expect(planResize({ width: 11904, height: 5952, bytes: 32 * MB, type: "image/jpeg" }, "panorama")).toEqual({
      action: "resize",
      width: 6144,
      height: 3072,
      type: "image/jpeg",
      quality: 0.88,
    });
  });

  it("keeps a panorama that already fits, untouched", () => {
    expect(planResize({ width: 6144, height: 3072, bytes: 6 * MB, type: "image/jpeg" }, "panorama")).toEqual({
      action: "keep",
    });
  });

  it("re-encodes a small-enough image that is still over 10 MB", () => {
    const plan = planResize({ width: 6000, height: 3000, bytes: MAX_UPLOAD_BYTES + 1, type: "image/png" }, "panorama");
    expect(plan).toMatchObject({ action: "resize", width: 6000, height: 3000, type: "image/jpeg" });
  });

  it("caps panoramas lower on iOS, where big canvases fail", () => {
    expect(planResize({ width: 11904, height: 5952, bytes: 32 * MB, type: "image/jpeg" }, "panorama", { ios: true })).toMatchObject({
      width: 4096,
      height: 2048,
    });
  });

  it("caps listing photos by their longest edge, portrait or landscape", () => {
    expect(planResize({ width: 4000, height: 6000, bytes: 12 * MB, type: "image/jpeg" }, "photo")).toMatchObject({
      width: 2133,
      height: 3200,
    });
  });

  it("keeps floor plans as PNG", () => {
    expect(planResize({ width: 5000, height: 3500, bytes: 4 * MB, type: "image/png" }, "floor_plan")).toMatchObject({
      type: "image/png",
      width: 2400,
      height: 1680,
    });
  });

  it("refuses what isn't a JPEG, PNG or WebP, and broken dimensions", () => {
    expect(planResize({ width: 100, height: 50, bytes: 1, type: "image/heic" }, "panorama")).toEqual({
      action: "refuse",
      reason: "type",
    });
    expect(planResize({ width: 0, height: 0, bytes: 1, type: "image/jpeg" }, "photo")).toEqual({
      action: "refuse",
      reason: "dimensions",
    });
  });
});

describe("nextAttempt", () => {
  it("lowers JPEG quality, then size, then gives up", () => {
    let plan: Extract<ResizePlan, { action: "resize" }> = {
      action: "resize",
      width: 6144,
      height: 3072,
      type: "image/jpeg",
      quality: 0.88,
    };
    const qualities: number[] = [];
    const widths: number[] = [];
    for (let next = nextAttempt(plan); next; next = nextAttempt(plan)) {
      plan = next;
      qualities.push(plan.quality);
      widths.push(plan.width);
    }
    expect(qualities.slice(0, 2)).toEqual([0.8, 0.72]);
    expect(widths.at(-1)).toBeGreaterThanOrEqual(1024);
    expect(widths.every((w, i) => i === 0 || w <= widths[i - 1])).toBe(true);
  });

  it("keeps a resized panorama exactly 2:1 when it shrinks", () => {
    const next = nextAttempt({ action: "resize", width: 6144, height: 3072, type: "image/jpeg", quality: 0.72 });
    expect(next).toMatchObject({ width: 5222, height: 2611 });
  });
});

describe("logos", () => {
  it("keep their transparency when resized, as PNG, at most 1024 px", () => {
    expect(planResize({ width: 4000, height: 2000, bytes: 3_000_000, type: "image/webp" }, "logo")).toEqual({
      action: "resize",
      width: 1024,
      height: 512,
      type: "image/png",
      quality: 0.88,
    });
    expect(planResize({ width: 800, height: 400, bytes: 90_000, type: "image/png" }, "logo")).toEqual({ action: "keep" });
  });
});
