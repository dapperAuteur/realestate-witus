import { describe, expect, it } from "vitest";
import {
  BRAND_PRESETS,
  DEFAULT_PRESET_KEY,
  brandCssVars,
  normalizeBrandPreset,
  presetByKey,
} from "./brand-presets";

describe("normalizeBrandPreset", () => {
  it("accepts every curated preset key", () => {
    for (const p of BRAND_PRESETS) {
      expect(normalizeBrandPreset(p.key)).toBe(p.key);
    }
  });

  it("rejects free-form hex and unknown keys", () => {
    expect(normalizeBrandPreset("#ff0000")).toBeNull();
    expect(normalizeBrandPreset("hotpink")).toBeNull();
    expect(normalizeBrandPreset("")).toBeNull();
    expect(normalizeBrandPreset(null)).toBeNull();
    expect(normalizeBrandPreset(undefined)).toBeNull();
  });
});

describe("presetByKey", () => {
  it("falls back to the default preset for unknown input", () => {
    expect(presetByKey("nope").key).toBe(DEFAULT_PRESET_KEY);
    expect(presetByKey(undefined).key).toBe(DEFAULT_PRESET_KEY);
  });
});

describe("brandCssVars", () => {
  it("emits accent variables for a known preset", () => {
    const vars = brandCssVars("terracotta");
    expect(vars["--brand-accent"]).toBe("#993c1d");
    expect(vars["--brand-accent-fg"]).toBe("#ffffff");
  });
});
