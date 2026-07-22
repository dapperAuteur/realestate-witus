// Curated font pairings (rung 2). Pure registry + normalizer — the actual
// next/font loaders live in fonts.ts so this module stays testable in vitest.
// Curated-only, no free Google Font input: every pair is contrast- and
// legibility-reviewed once, then safe for every tenant (plans/03 decision).

export interface FontPair {
  key: string;
  label: string;
}

export const FONT_PAIRS: readonly FontPair[] = [
  /** System sans everywhere — the scaffold look; loads no webfont. */
  { key: "modern", label: "Modern (system sans)" },
  { key: "classic", label: "Classic (Playfair Display + Source Sans)" },
  { key: "warm", label: "Warm (Fraunces + Nunito Sans)" },
  { key: "editorial", label: "Editorial (Lora + Inter)" },
] as const;

export const DEFAULT_FONT_PAIR_KEY = "modern";

const PAIR_KEYS = new Set(FONT_PAIRS.map((p) => p.key));

/** Accepts only curated keys; anything else collapses to null (default). */
export function normalizeFontPair(key: string | null | undefined): string | null {
  if (!key) return null;
  return PAIR_KEYS.has(key) ? key : null;
}
