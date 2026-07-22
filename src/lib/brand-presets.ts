// Curated, WCAG-checked brand presets (pattern: wanderlearn tour-styling.ts).
// Free-form hex is intentionally not accepted: presets are pre-validated for
// contrast in light and dark chrome. normalizeBrandPreset() is the single
// server chokepoint before any theme write.

export interface BrandPreset {
  key: string;
  label: string;
  /** Accent on white/near-white chrome; contrast >= 4.5:1 against #fff text. */
  accent: string;
  accentFg: string;
}

export const BRAND_PRESETS: readonly BrandPreset[] = [
  { key: "forest", label: "Forest", accent: "#0b6b57", accentFg: "#ffffff" },
  { key: "kente-gold", label: "Kente Gold", accent: "#8a5a00", accentFg: "#ffffff" },
  { key: "terracotta", label: "Terracotta", accent: "#993c1d", accentFg: "#ffffff" },
  { key: "atlantic", label: "Atlantic", accent: "#0f4c81", accentFg: "#ffffff" },
  { key: "aubergine", label: "Aubergine", accent: "#5b2a63", accentFg: "#ffffff" },
  { key: "charcoal", label: "Charcoal", accent: "#1f2937", accentFg: "#ffffff" },
  { key: "crimson", label: "Crimson", accent: "#9f1239", accentFg: "#ffffff" },
  { key: "rainforest", label: "Rainforest", accent: "#14532d", accentFg: "#ffffff" },
] as const;

const PRESET_KEYS = new Set(BRAND_PRESETS.map((p) => p.key));

export const DEFAULT_PRESET_KEY = "forest";

/** Accepts only known preset keys; anything else collapses to null (default). */
export function normalizeBrandPreset(key: string | null | undefined): string | null {
  if (!key) return null;
  return PRESET_KEYS.has(key) ? key : null;
}

export function presetByKey(key: string | null | undefined): BrandPreset {
  const k = normalizeBrandPreset(key) ?? DEFAULT_PRESET_KEY;
  return BRAND_PRESETS.find((p) => p.key === k) ?? BRAND_PRESETS[0];
}

/** CSS custom properties applied on the tenant layout. */
export function brandCssVars(key: string | null | undefined): Record<string, string> {
  const preset = presetByKey(key);
  return {
    "--brand-accent": preset.accent,
    "--brand-accent-fg": preset.accentFg,
  };
}
