// Ported from wanderlearn-app src/lib/arrow-rotation.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import { isValidArrowRotation, rotateArrow } from "./arrow-rotation";

describe("rotateArrow", () => {
  it("turns clockwise and anticlockwise in 15° steps", () => {
    expect(rotateArrow(0, 15)).toBe(15);
    expect(rotateArrow(45, -15)).toBe(30);
  });

  it("wraps both ways", () => {
    expect(rotateArrow(0, -15)).toBe(345);
    expect(rotateArrow(345, 15)).toBe(0);
  });
});

describe("isValidArrowRotation", () => {
  it.each([0, 15, 90, 345])("accepts %s", (v) => expect(isValidArrowRotation(v)).toBe(true));
  it.each([-15, 7, 360, 12.5, Number.NaN])("rejects %s", (v) =>
    expect(isValidArrowRotation(v)).toBe(false),
  );
});
