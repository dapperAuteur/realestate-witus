import { describe, expect, it } from "vitest";
import { normalizeDesignInput } from "./design";

describe("normalizeDesignInput", () => {
  it("collapses unknown presets, fonts, sections, and variants", () => {
    const patch = normalizeDesignInput({
      presetKey: "hotdog-stand",
      fontPairKey: "comic-sans",
      sectionOrder: ["rooms", "casino", "rooms", "hero"],
      sectionHidden: ["hero", "events", "casino"],
      sectionVariants: { rooms: "list", hero: "marquee", casino: "neon" },
    });
    expect(patch.presetKey).toBeUndefined();
    expect(patch.fontPairKey).toBeUndefined();
    expect(patch.sectionOrder).toEqual(["rooms", "hero"]);
    expect(patch.sectionHidden).toEqual(["events"]); // hero is never hideable
    expect(patch.sectionVariants).toEqual({ rooms: "list", hero: "image" });
  });

  it("passes curated values through untouched", () => {
    const patch = normalizeDesignInput({
      presetKey: "terracotta",
      fontPairKey: "classic",
    });
    expect(patch).toEqual({ presetKey: "terracotta", fontPairKey: "classic" });
  });

  it("leaves unspecified fields out of the patch entirely", () => {
    expect(normalizeDesignInput({})).toEqual({});
  });
});
