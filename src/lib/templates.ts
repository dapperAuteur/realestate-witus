// Template catalog (plans/11 addendum, BAM decisions 2026-07-14: 3 templates,
// included with every plan, Editorial Boutique is the flagship). A template
// is a design system rendered by code we own — owners pick one and customize
// within it (palettes, fonts, sections, variants, photography), so WCAG and
// mobile hold by construction and differentiation compounds multiplicatively.
//
// NEUTRALS NOTE: "warm" uses stone-* neutrals — a deliberate, BAM-approved
// carve-out from the ecosystem slate-* rule, scoped to this template only.

export interface TemplateDef {
  key: string;
  /** Hero treatment: boxed image card vs full-bleed with scrim overlay. */
  hero: "boxed" | "fullbleed";
  /** Rooms treatment: cards vs alternating editorial rows. */
  rooms: "cards" | "editorial";
  /** Alternating section background bands (accent-tinted). */
  bands: boolean;
  /** Class tokens consumed by section components. */
  t: {
    /** Extra classes on <main>. */
    page: string;
    /** Section vertical rhythm. */
    section: string;
    /** h2 section headings. */
    h2: string;
    /** Small accent eyebrow above section headings ("" = none). */
    eyebrow: string;
    /** Card container. */
    card: string;
    /** Primary action (filled). */
    action: string;
    /** h1 display heading. */
    display: string;
  };
}

const FOCUS =
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

export const TEMPLATES: Record<string, TemplateDef> = {
  /** The original look: compact, bordered, quietly competent. */
  classic: {
    key: "classic",
    hero: "boxed",
    rooms: "cards",
    bands: false,
    t: {
      page: "",
      section: "mt-14",
      h2: "text-2xl font-bold [font-family:var(--font-heading)]",
      eyebrow: "",
      card: "rounded-xl border border-slate-200 dark:border-slate-800",
      action: `inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold ${FOCUS}`,
      display:
        "text-4xl font-bold leading-tight [font-family:var(--font-heading)] sm:text-5xl",
    },
  },
  /** Flagship: photography-first, big serif display type, editorial rhythm. */
  editorial: {
    key: "editorial",
    hero: "fullbleed",
    rooms: "editorial",
    bands: true,
    t: {
      page: "tracking-[0.005em]",
      section: "py-14 sm:py-20",
      h2: "text-3xl font-semibold tracking-tight [font-family:var(--font-heading)] sm:text-4xl",
      eyebrow: "mb-4 block h-0.5 w-12",
      card: "rounded-none border-0 border-b border-slate-200 last:border-b-0 dark:border-slate-800",
      action: `inline-flex min-h-12 items-center px-8 text-sm font-semibold uppercase tracking-widest ${FOCUS}`,
      display:
        "text-5xl font-semibold leading-[1.05] tracking-tight [font-family:var(--font-heading)] sm:text-7xl",
    },
  },
  /** Soft, rounded, borderless; stone neutrals (approved carve-out). */
  warm: {
    key: "warm",
    hero: "boxed",
    rooms: "cards",
    bands: true,
    t: {
      page: "",
      section: "py-12 sm:py-16",
      h2: "text-2xl font-bold [font-family:var(--font-heading)] sm:text-3xl",
      eyebrow: "",
      card: "rounded-3xl border-0 bg-white shadow-[0_2px_16px_rgb(0_0_0/0.07)] dark:bg-stone-900",
      action: `inline-flex min-h-12 items-center rounded-2xl px-7 text-sm font-bold ${FOCUS}`,
      display:
        "text-4xl font-extrabold leading-tight [font-family:var(--font-heading)] sm:text-5xl",
    },
  },
};

export const DEFAULT_TEMPLATE_KEY = "classic";

export function normalizeTemplate(key: string | null | undefined): string | null {
  if (!key) return null;
  return key in TEMPLATES ? key : null;
}

export function templateFor(key: string | null | undefined): TemplateDef {
  return TEMPLATES[normalizeTemplate(key) ?? DEFAULT_TEMPLATE_KEY];
}

/** Accent-tinted band background for alternating sections (works both modes). */
export const BAND_TINT = "color-mix(in srgb, var(--brand-accent) 6%, transparent)";
