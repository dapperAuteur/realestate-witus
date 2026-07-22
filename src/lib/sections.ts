// Rung 2 section control (plans/03, picked by BAM 2026-07-13): owners reorder,
// hide, and pick layout variants for homepage sections — always inside layouts
// we designed, so mobile-first and WCAG hold by construction. This module is
// the single normalize chokepoint (pattern: brand-presets.ts): unknown keys
// and variants collapse to defaults, never to an error page.

import type { TenantFlags, TenantTheme } from "@/db/schema/tenancy";

export const SECTION_KEYS = [
  "hero",
  "about",
  "rooms",
  "dining",
  "events",
  "concierge",
  "guide",
  "tour",
  "contact",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const DEFAULT_SECTION_ORDER: readonly SectionKey[] = SECTION_KEYS;

/**
 * First variant is the default. Hero carousel/video variants are planned but
 * land with the media workstream (Cloudinary intake, task 05) — the registry
 * grows without touching the normalizer.
 */
export const SECTION_VARIANTS: Record<SectionKey, readonly string[]> = {
  hero: ["image", "minimal"],
  about: ["default"],
  rooms: ["grid", "list"],
  dining: ["default"],
  events: ["default"],
  concierge: ["default"],
  guide: ["default"],
  tour: ["default"],
  contact: ["default"],
};

/** Sections that only exist when BAM enables the tenant flag in /platform. */
const SECTION_FLAG: Partial<Record<SectionKey, keyof TenantFlags>> = {
  dining: "dining",
  events: "events",
  concierge: "concierge",
  tour: "virtualTour",
};

export interface SectionConfig {
  /** Visible sections, in render order. */
  order: SectionKey[];
  /** Normalized variant per section (defaults filled in). */
  variants: Record<SectionKey, string>;
}

function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

export function normalizeSectionVariant(
  section: SectionKey,
  variant: string | null | undefined,
): string {
  const allowed = SECTION_VARIANTS[section];
  return variant && allowed.includes(variant) ? variant : allowed[0];
}

/**
 * theme.sectionOrder/sectionHidden/sectionVariants → the exact render plan.
 * Owner input is advisory: unknown sections drop, missing sections append in
 * default order (new platform sections appear for existing tenants), flags
 * gate optional sections, and "hero" ignores hide attempts so every site
 * keeps its H1.
 */
export function resolveSectionConfig(
  theme: Pick<TenantTheme, "sectionOrder" | "sectionHidden" | "sectionVariants">,
  flags: TenantFlags,
): SectionConfig {
  const seen = new Set<SectionKey>();
  const ordered: SectionKey[] = [];
  for (const key of theme.sectionOrder ?? []) {
    if (isSectionKey(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!seen.has(key)) ordered.push(key);
  }

  const hidden = new Set<SectionKey>(
    (theme.sectionHidden ?? []).filter(
      (key): key is SectionKey => isSectionKey(key) && key !== "hero",
    ),
  );

  const order = ordered.filter((key) => {
    if (hidden.has(key)) return false;
    const flag = SECTION_FLAG[key];
    return flag ? flags[flag] === true : true;
  });

  const variants = Object.fromEntries(
    SECTION_KEYS.map((key) => [
      key,
      normalizeSectionVariant(key, theme.sectionVariants?.[key]),
    ]),
  ) as Record<SectionKey, string>;

  return { order, variants };
}
