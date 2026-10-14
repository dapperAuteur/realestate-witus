import { describe, expect, it } from "vitest";
import {
  approximateCoordinates,
  descriptionParagraphs,
  displayAddress,
  factStrip,
  formatPrice,
  formatPricePerArea,
  isPublicStatus,
} from "./format";

describe("isPublicStatus", () => {
  it("keeps sold listings public and drafts private", () => {
    expect(isPublicStatus("for_sale")).toBe(true);
    expect(isPublicStatus("under_offer")).toBe(true);
    expect(isPublicStatus("sold")).toBe(true);
    expect(isPublicStatus("draft")).toBe(false);
    expect(isPublicStatus("withdrawn")).toBe(false);
  });
});

describe("formatPrice", () => {
  it("shows whole units", () => {
    expect(formatPrice(125_000_000, "USD")).toBe("$1,250,000");
  });

  it("is null when the price is on request", () => {
    expect(formatPrice(null, "USD")).toBeNull();
  });

  it("handles prices past the 32-bit range", () => {
    expect(formatPrice(5_000_000_000_000, "USD")).toBe("$50,000,000,000");
  });

  it("formats other currencies", () => {
    expect(formatPrice(250_000_000, "GHS")).toContain("2,500,000");
  });

  it("survives a nonsense currency code", () => {
    expect(formatPrice(100_00, "ZZZZ")).toBe("ZZZZ 100");
  });
});

describe("formatPricePerArea", () => {
  it("divides and rounds", () => {
    expect(formatPricePerArea(125_000_000, "USD", 2140)).toBe("$584");
  });

  it("needs both numbers", () => {
    expect(formatPricePerArea(null, "USD", 2000)).toBeNull();
    expect(formatPricePerArea(100_000, "USD", undefined)).toBeNull();
    expect(formatPricePerArea(100_000, "USD", 0)).toBeNull();
  });
});

describe("factStrip", () => {
  it("residential: beds, baths, area, price per area", () => {
    const cells = factStrip({
      kind: "single_family",
      facts: { bedrooms: 4, bathrooms: 2.5, interiorArea: 2140, areaUnit: "sqft" },
      priceMinor: 125_000_000,
      currency: "USD",
    });
    expect(cells).toEqual([
      { key: "bedrooms", value: "4" },
      { key: "bathrooms", value: "2.5" },
      { key: "area", value: "2,140", unit: "sqft" },
      { key: "pricePerArea", value: "$584", unit: "sqft" },
    ]);
  });

  it("commercial: area, units, zoning, price per area", () => {
    const cells = factStrip({
      kind: "commercial",
      facts: { bedrooms: 9, interiorArea: 1200, areaUnit: "sqm", units: 6, zoning: "C-2" },
      priceMinor: 240_000_000,
      currency: "USD",
    });
    expect(cells.map((c) => c.key)).toEqual(["area", "units", "zoning", "pricePerArea"]);
    expect(cells[0]).toEqual({ key: "area", value: "1,200", unit: "sqm" });
  });

  it("omits what the agent didn't give", () => {
    const cells = factStrip({ kind: "single_family", facts: { bedrooms: 3 }, priceMinor: null, currency: "USD" });
    expect(cells).toEqual([{ key: "bedrooms", value: "3" }]);
  });
});

describe("displayAddress", () => {
  const parts = {
    addressLine1: "14 Ring Road",
    addressLine2: "Unit 3",
    neighborhood: "Osu",
    locality: "Accra",
    region: "Greater Accra",
    postalCode: "GA-123",
  };

  it("shows the street, then the area", () => {
    expect(displayAddress(parts, false)).toEqual({
      primary: "14 Ring Road, Unit 3",
      secondary: "Osu · Accra, Greater Accra GA-123",
    });
  });

  it("hides the street entirely when asked", () => {
    const shown = displayAddress(parts, true);
    expect(shown).toEqual({ primary: "Osu", secondary: "Accra, Greater Accra" });
    expect(JSON.stringify(shown)).not.toContain("Ring Road");
  });

  it("falls back to the locality when there is no neighborhood", () => {
    expect(displayAddress({ ...parts, neighborhood: null }, true)).toEqual({
      primary: "Accra",
      secondary: "Greater Accra",
    });
  });
});

describe("approximateCoordinates", () => {
  it("rounds to about a kilometer", () => {
    expect(approximateCoordinates(5.556123, -0.196789)).toEqual({ lat: 5.56, lng: -0.2 });
  });
});

describe("descriptionParagraphs", () => {
  it("splits on blank lines and drops empties", () => {
    expect(descriptionParagraphs("One.\n\n  Two.\r\n\r\nThree.\n\n\n")).toEqual(["One.", "Two.", "Three."]);
  });

  it("is empty for no description", () => {
    expect(descriptionParagraphs(null)).toEqual([]);
  });
});
