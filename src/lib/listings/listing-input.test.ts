import { describe, expect, it } from "vitest";
import {
  lines,
  parseListingInput,
  parsePrice,
  parsePropertyInput,
  parseStatus,
  statusTimestamps,
} from "./listing-input";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parsePrice", () => {
  it("reads whole units with separators", () => {
    expect(parsePrice("1,250,000")).toBe(125_000_000);
    expect(parsePrice("1 250 000")).toBe(125_000_000);
    expect(parsePrice("99.5")).toBe(9_950);
  });

  it("is null when blank and undefined when not a number", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice("$1m")).toBeUndefined();
    expect(parsePrice("-5")).toBeUndefined();
    expect(parsePrice("1.234")).toBeUndefined();
  });
});

describe("lines", () => {
  it("splits, trims, drops blanks and leading bullets", () => {
    expect(lines("- Gas range\n\n • Walk-in pantry \n* Oak floors", 10)).toEqual(["Gas range", "Walk-in pantry", "Oak floors"]);
  });

  it("refuses too many items or an overlong line", () => {
    expect(lines("a\nb\nc\nd", 3)).toBeUndefined();
    expect(lines("x".repeat(201), 3)).toBeUndefined();
  });
});

describe("parsePropertyInput", () => {
  const base = { kind: "single_family", addressLine1: " 14 Ring Road ", countryCode: "gh", locality: "Accra" };

  it("accepts an address and upper-cases the country", () => {
    const result = parsePropertyInput(form(base));
    expect(result).toMatchObject({ ok: true, data: { addressLine1: "14 Ring Road", countryCode: "GH", locality: "Accra", latitude: null } });
  });

  it("needs a street address and a two-letter country", () => {
    expect(parsePropertyInput(form({ ...base, addressLine1: " " }))).toMatchObject({ ok: false, code: "ADDRESS_LINE1" });
    expect(parsePropertyInput(form({ ...base, countryCode: "Ghana" }))).toMatchObject({ ok: false, code: "COUNTRY_CODE" });
  });

  it("wants both coordinates or neither, in range", () => {
    expect(parsePropertyInput(form({ ...base, latitude: "5.556" }))).toMatchObject({ ok: false, code: "COORDINATES" });
    expect(parsePropertyInput(form({ ...base, latitude: "95", longitude: "0" }))).toMatchObject({ ok: false, code: "COORDINATES" });
    expect(parsePropertyInput(form({ ...base, latitude: "5.556", longitude: "-0.183" }))).toMatchObject({
      ok: true,
      data: { latitude: "5.556000", longitude: "-0.183000" },
    });
  });

  it("rejects an unknown kind", () => {
    expect(parsePropertyInput(form({ ...base, kind: "castle" }))).toMatchObject({ ok: false, code: "PROPERTY_KIND" });
  });
});

describe("parseListingInput", () => {
  const base = {
    title: "Renovated house with a garden",
    price: "1,250,000",
    currency: "usd",
    highlights: "New kitchen\nSouth garden",
    bedrooms: "3",
    bathrooms: "2.5",
    interiorArea: "2,140",
    areaUnit: "sqft",
    "features.interior": "Gas range\nOak floors",
    hideAddress: "on",
    galleryMode: "strip",
  };

  it("parses the whole form", () => {
    const result = parseListingInput(form(base));
    expect(result).toEqual({
      ok: true,
      data: {
        title: "Renovated house with a garden",
        priceMinor: 125_000_000,
        currency: "USD",
        highlights: ["New kitchen", "South garden"],
        description: null,
        facts: { bedrooms: 3, bathrooms: 2.5, interiorArea: 2140, areaUnit: "sqft" },
        features: { interior: ["Gas range", "Oak floors"] },
        hideAddress: true,
        galleryMode: "strip",
      },
    });
  });

  it("allows price on request", () => {
    const result = parseListingInput(form({ ...base, price: "" }));
    expect(result.ok && result.data.priceMinor).toBeNull();
  });

  it("caps highlights at three", () => {
    expect(parseListingInput(form({ ...base, highlights: "a\nb\nc\nd" }))).toMatchObject({ ok: false, code: "LISTING_HIGHLIGHTS" });
  });

  it("rejects half bedrooms and quarter bathrooms", () => {
    expect(parseListingInput(form({ ...base, bedrooms: "2.5" }))).toMatchObject({ ok: false, code: "LISTING_FACT" });
    expect(parseListingInput(form({ ...base, bathrooms: "2.25" }))).toMatchObject({ ok: false, code: "LISTING_FACT" });
  });

  it("needs a title", () => {
    expect(parseListingInput(form({ ...base, title: "" }))).toMatchObject({ ok: false, code: "LISTING_TITLE" });
  });

  it("leaves the gallery to the agency default when not chosen", () => {
    const result = parseListingInput(form({ ...base, galleryMode: "default" }));
    expect(result.ok && result.data.galleryMode).toBeNull();
  });
});

describe("parseStatus", () => {
  it("knows the five statuses", () => {
    expect(parseStatus("under_offer")).toBe("under_offer");
    expect(parseStatus("archived")).toBeNull();
  });
});

describe("statusTimestamps", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  const earlier = new Date("2026-09-01T00:00:00Z");

  it("records the first publication and keeps it", () => {
    expect(statusTimestamps("for_sale", { publishedAt: null, soldAt: null }, now)).toEqual({ publishedAt: now, soldAt: null });
    expect(statusTimestamps("under_offer", { publishedAt: earlier, soldAt: null }, now).publishedAt).toBe(earlier);
  });

  it("stamps a sale once, and clears it if the sale falls through", () => {
    expect(statusTimestamps("sold", { publishedAt: earlier, soldAt: null }, now).soldAt).toBe(now);
    expect(statusTimestamps("sold", { publishedAt: earlier, soldAt: earlier }, now).soldAt).toBe(earlier);
    expect(statusTimestamps("for_sale", { publishedAt: earlier, soldAt: earlier }, now).soldAt).toBeNull();
  });

  it("does not publish a draft", () => {
    expect(statusTimestamps("draft", { publishedAt: null, soldAt: null }, now)).toEqual({ publishedAt: null, soldAt: null });
  });
});
