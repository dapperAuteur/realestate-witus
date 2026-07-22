import { describe, expect, it } from "vitest";
import { stayRange } from "./_types";

describe("stayRange", () => {
  it("builds a half-open range so back-to-back stays never overlap", () => {
    expect(stayRange("2026-12-01", "2026-12-05")).toBe("[2026-12-01,2026-12-05)");
  });
});
