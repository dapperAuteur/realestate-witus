import { describe, expect, it } from "vitest";
import { normalizeFontPair } from "./font-pairs";

describe("normalizeFontPair", () => {
  it("accepts curated keys only", () => {
    expect(normalizeFontPair("classic")).toBe("classic");
    expect(normalizeFontPair("warm")).toBe("warm");
  });

  it("collapses free-form input to null (default pair)", () => {
    expect(normalizeFontPair("comic-sans")).toBeNull();
    expect(normalizeFontPair("")).toBeNull();
    expect(normalizeFontPair(undefined)).toBeNull();
  });
});
