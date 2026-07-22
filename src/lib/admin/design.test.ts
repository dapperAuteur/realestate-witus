import { describe, expect, it } from "vitest";
import { normalizeDesignInput } from "./design";

describe("normalizeDesignInput", () => {
  it("collapses unknown templates, presets, and fonts", () => {
    const patch = normalizeDesignInput({
      templateKey: "casino",
      presetKey: "hotdog-stand",
      fontPairKey: "comic-sans",
    });
    expect(patch.templateKey).toBeUndefined();
    expect(patch.presetKey).toBeUndefined();
    expect(patch.fontPairKey).toBeUndefined();
  });

  it("passes curated values through untouched", () => {
    const patch = normalizeDesignInput({
      templateKey: "editorial",
      presetKey: "terracotta",
      fontPairKey: "classic",
    });
    expect(patch).toEqual({
      templateKey: "editorial",
      presetKey: "terracotta",
      fontPairKey: "classic",
    });
  });

  it("leaves unspecified fields out of the patch entirely", () => {
    expect(normalizeDesignInput({})).toEqual({});
  });
});
