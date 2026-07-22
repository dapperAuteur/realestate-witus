import { describe, expect, it } from "vitest";
import { formatMoneyMinor } from "./money";

describe("formatMoneyMinor", () => {
  it("renders pesewas as GHS with the code visible", () => {
    expect(formatMoneyMinor(50_000, "GHS")).toMatch(/GHS\s?500\.00/);
  });

  it("survives an unknown currency code", () => {
    expect(formatMoneyMinor(1_234, "ZZZ")).toContain("12.34");
  });
});
