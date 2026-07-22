import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { BRAND_PRESETS, DEFAULT_PRESET_KEY } from "@/lib/brand-presets";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { DEFAULT_FONT_PAIR_KEY, FONT_PAIRS } from "@/lib/font-pairs";
import { DEFAULT_TEMPLATE_KEY, TEMPLATES } from "@/lib/templates";
import { saveDesignAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design" };

// Brand controls: one plain form, no JS, accessible on a phone.
// saveDesignAction normalizes everything against the curated registries.
// Listing-page layout controls (gallery mode, section arrangement) join here
// with the listings workstream.

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
