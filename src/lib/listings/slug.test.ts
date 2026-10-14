import { describe, expect, it } from "vitest";
import { isListingSlug, listingSlug, randomSlugSuffix, slugify } from "./slug";

describe("slugify", () => {
  it("makes lowercase hyphenated words", () => {
    expect(slugify("3 Bed House in Osu, Accra")).toBe("3-bed-house-in-osu-accra");
  });

  it("drops accents and spells out ampersands", () => {
    expect(slugify("Café & Résidence")).toBe("cafe-and-residence");
  });

  it("cuts long titles at a word boundary", () => {
    const slug = slugify("A very long listing title that goes on and on about the sea views and the garden", 40);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a-very-long-listing-title-that-goes-on");
  });

  it("is empty for text with no letters or digits", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("listingSlug", () => {
  it("adds the suffix", () => {
    expect(listingSlug("Osu Heights", "k3x9ab")).toBe("osu-heights-k3x9ab");
  });

  it("falls back to 'listing' when the text has nothing usable", () => {
    expect(listingSlug("???", "k3x9ab")).toBe("listing-k3x9ab");
  });
});

describe("randomSlugSuffix", () => {
  it("uses six unambiguous characters", () => {
    const suffix = randomSlugSuffix(() => new Uint8Array([0, 1, 2, 3, 255, 31]));
    expect(suffix).toHaveLength(6);
    expect(suffix).toMatch(/^[a-km-np-z2-9]{6}$/);
  });

  it("is random by default", () => {
    expect(randomSlugSuffix()).not.toBe(randomSlugSuffix());
  });
});

describe("isListingSlug", () => {
  it("accepts what listingSlug makes", () => {
    expect(isListingSlug(listingSlug("Osu Heights", "k3x9ab"))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isListingSlug("../etc/passwd")).toBe(false);
    expect(isListingSlug("Osu-Heights")).toBe(false);
    expect(isListingSlug("a--b")).toBe(false);
    expect(isListingSlug("x".repeat(81))).toBe(false);
  });
});
