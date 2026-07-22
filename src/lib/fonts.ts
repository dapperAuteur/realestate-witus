// next/font loaders for the curated pairs (font-pairs.ts holds the pure
// registry). Loaders must be module-scope consts; the browser only downloads
// a font once a rendered element actually uses its family, so declaring all
// pairs costs bytes only for the pair a tenant picked.

import {
  Fraunces,
  Inter,
  Lora,
  Nunito_Sans,
  Playfair_Display,
  Source_Sans_3,
} from "next/font/google";
import { DEFAULT_FONT_PAIR_KEY, normalizeFontPair } from "./font-pairs";

const playfair = Playfair_Display({ subsets: ["latin"], display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap" });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const inter = Inter({ subsets: ["latin"], display: "swap" });

interface PairFonts {
  heading: string;
  body: string;
}

/** "modern" is absent on purpose: it inherits the Tailwind sans stack. */
const PAIR_FAMILIES: Record<string, PairFonts> = {
  classic: {
    heading: playfair.style.fontFamily,
    body: sourceSans.style.fontFamily,
  },
  warm: { heading: fraunces.style.fontFamily, body: nunitoSans.style.fontFamily },
  editorial: { heading: lora.style.fontFamily, body: inter.style.fontFamily },
};

/**
 * CSS custom properties for the tenant wrapper. Headings opt in with the
 * `[font-family:var(--font-heading)]` utility; body text inherits via the
 * wrapper's font-family. The default pair sets nothing, keeping the
 * scaffold's system stack byte-identical.
 */
export function fontPairCssVars(
  key: string | null | undefined,
): Record<string, string> {
  const k = normalizeFontPair(key) ?? DEFAULT_FONT_PAIR_KEY;
  const pair = PAIR_FAMILIES[k];
  if (!pair) return {};
  return { "--font-heading": pair.heading, "--font-body": pair.body };
}
