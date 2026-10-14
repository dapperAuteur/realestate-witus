import { describe, expect, it } from "vitest";
import {
  looksEquirectangular,
  normalizeYaw,
  parsePlanPoint,
  parsePosition,
  parseRoll,
  parseViewLimit,
  sceneNameFromFile,
} from "./tour-input";

describe("normalizeYaw", () => {
  it("wraps into (-PI, PI]", () => {
    expect(normalizeYaw(0)).toBe(0);
    expect(normalizeYaw(Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeYaw(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeYaw(-Math.PI * 3)).toBeCloseTo(Math.PI);
  });
});

describe("parsePosition", () => {
  it("accepts numbers and strings, clamping pitch", () => {
    expect(parsePosition("0.5", 2)).toEqual({ yaw: 0.5, pitch: Math.PI / 2 });
  });

  it("refuses anything else", () => {
    expect(parsePosition("left", 0)).toBeNull();
    expect(parsePosition(0, Number.NaN)).toBeNull();
  });
});

describe("parseRoll and parseViewLimit", () => {
  it("clamp to the editor ranges, and clear on zero or blank", () => {
    expect(parseRoll("3.14159")).toBe(3.1);
    expect(parseRoll(40)).toBe(15);
    expect(parseRoll("0")).toBeNull();
    expect(parseRoll("")).toBeNull();
    expect(parseRoll("tilt")).toBeUndefined();
    expect(parseViewLimit("-120")).toBe(-85);
    expect(parseViewLimit("-49.6")).toBe(-50);
    expect(parseViewLimit("")).toBeNull();
  });
});

describe("parsePlanPoint", () => {
  it("clamps into the plan and rounds", () => {
    expect(parsePlanPoint(0.123456, -0.2)).toEqual({ x: 0.1235, y: 0 });
    expect(parsePlanPoint("x", 1)).toBeNull();
  });
});

describe("sceneNameFromFile", () => {
  it("turns a descriptive filename into a room name", () => {
    expect(sceneNameFromFile("living-room.jpg", 0)).toBe("Living room");
    expect(sceneNameFromFile("Main_Bedroom.JPG", 3)).toBe("Main bedroom");
    expect(sceneNameFromFile("rooftop terrace.jpg", 0)).toBe("Rooftop terrace");
    expect(sceneNameFromFile("Pantry.jpg", 0)).toBe("Pantry");
  });

  it("numbers camera filenames instead of guessing", () => {
    expect(sceneNameFromFile("IMG_20260712_101530_00_123.insp", 0)).toBe("Room 1");
    expect(sceneNameFromFile("PANO0001.jpg", 4)).toBe("Room 5");
    expect(sceneNameFromFile("R0010023.JPG", 1)).toBe("Room 2");
    expect(sceneNameFromFile("12.jpg", 2)).toBe("Room 3");
  });
});

describe("looksEquirectangular", () => {
  it("wants 2:1", () => {
    expect(looksEquirectangular(11904, 5952)).toBe(true);
    expect(looksEquirectangular(6000, 3000)).toBe(true);
    expect(looksEquirectangular(4000, 3000)).toBe(false);
    expect(looksEquirectangular(null, 3000)).toBe(false);
  });
});
