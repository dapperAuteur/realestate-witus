import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { BRAND_PRESETS, DEFAULT_PRESET_KEY } from "@/lib/brand-presets";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { DEFAULT_FONT_PAIR_KEY, FONT_PAIRS } from "@/lib/font-pairs";
import {
  resolveSectionConfig,
  SECTION_KEYS,
  SECTION_VARIANTS,
} from "@/lib/sections";
import { DEFAULT_TEMPLATE_KEY, TEMPLATES } from "@/lib/templates";
import { saveDesignAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design" };

// The rung-2 editor (plans/03): positions are number inputs, visibility is a
// checkbox, variants a select — one plain form, no JS, accessible on a phone.
// saveDesignAction normalizes everything against the curated registries.

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function AdminDesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const gate = { ctx: await requireStaffPage("manager", lang) };
  const a = dict.admin.design;
  const { tenant } = gate.ctx;
  const sp = await searchParams;

  // Current effective state (ignore flag gating here: the editor shows every
  // section the OWNER could arrange; flags decide what guests see).
  const config = resolveSectionConfig(tenant.theme, {
    dining: true,
    events: true,
    concierge: true,
    virtualTour: true,
  });
  const hiddenSet = new Set(tenant.theme.sectionHidden ?? []);
  const sectionTitles: Record<string, string> = {
    hero: "Welcome",
    about: dict.sections.aboutTitle,
    rooms: dict.sections.roomsTitle,
    dining: dict.sections.diningTitle,
    events: dict.sections.eventsTitle,
    concierge: dict.sections.conciergeTitle,
    guide: dict.sections.guideTitle,
    tour: dict.sections.tourTitle,
    contact: dict.sections.contactTitle,
  };

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>

      <form action={saveDesignAction} className="mt-6 flex flex-col gap-8">
        <input type="hidden" name="lang" value={lang} />

        <fieldset>
          <legend className="text-lg font-semibold">{a.template}</legend>
          <p className="mt-1 text-xs text-slate-500">{a.templateHint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {Object.keys(TEMPLATES).map((key) => (
              <label
                key={key}
                className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border border-slate-300 p-4 dark:border-slate-700"
              >
                <span className="inline-flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="templateKey"
                    value={key}
                    defaultChecked={
                      (tenant.theme.templateKey ?? DEFAULT_TEMPLATE_KEY) === key
                    }
                    className="h-4 w-4"
                  />
                  {a.templates[key as keyof typeof a.templates].name}
                </span>
                <span className="text-xs text-slate-500">
                  {a.templates[key as keyof typeof a.templates].blurb}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-lg font-semibold">{a.preset}</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {BRAND_PRESETS.map((preset) => (
              <label
                key={preset.key}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-4 text-sm dark:border-slate-700"
              >
                <input
                  type="radio"
                  name="presetKey"
                  value={preset.key}
                  defaultChecked={
                    (tenant.theme.presetKey ?? DEFAULT_PRESET_KEY) === preset.key
                  }
                  className="h-4 w-4"
                />
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full"
                  style={{ background: preset.accent }}
                />
                {preset.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-lg font-semibold">{a.fontPair}</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {FONT_PAIRS.map((pair) => (
              <label
                key={pair.key}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-4 text-sm dark:border-slate-700"
              >
                <input
                  type="radio"
                  name="fontPairKey"
                  value={pair.key}
                  defaultChecked={
                    (tenant.theme.fontPairKey ?? DEFAULT_FONT_PAIR_KEY) === pair.key
                  }
                  className="h-4 w-4"
                />
                {pair.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-lg font-semibold">{a.sections}</legend>
          <p className="mt-1 text-xs text-slate-500">{a.heroNote}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {config.order.map((key, index) => (
              <li
                key={key}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <span className="min-w-28 font-medium">{sectionTitles[key]}</span>
                <label className="inline-flex items-center gap-2 text-sm">
                  {a.orderField}
                  <input
                    type="number"
                    name={`order_${key}`}
                    defaultValue={index + 1}
                    min={1}
                    max={SECTION_KEYS.length}
                    className={`${INPUT} w-20`}
                  />
                </label>
                {key !== "hero" ? (
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`visible_${key}`}
                      value="1"
                      defaultChecked={!hiddenSet.has(key)}
                      className="h-4 w-4"
                    />
                    {a.visibleField}
                  </label>
                ) : (
                  <input type="hidden" name={`visible_${key}`} value="1" />
                )}
                {SECTION_VARIANTS[key].length > 1 ? (
                  <label className="inline-flex items-center gap-2 text-sm">
                    {a.variantField}
                    <select
                      name={`variant_${key}`}
                      defaultValue={config.variants[key]}
                      className={INPUT}
                    >
                      {SECTION_VARIANTS[key].map((variant) => (
                        <option key={variant} value={variant}>
                          {variant}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        </fieldset>

        <button
          type="submit"
          className="inline-flex min-h-12 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {a.save}
        </button>
      </form>
    </div>
  );
}
