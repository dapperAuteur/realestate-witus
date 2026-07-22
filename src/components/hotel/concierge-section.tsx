import Link from "next/link";
import type { partners } from "@/db/schema";
import type { Dictionary } from "@/lib/dictionaries";
import type { TemplateDef } from "@/lib/templates";
import { SectionShell } from "./section-shell";

type PartnerRow = typeof partners.$inferSelect;

const ACTION_CLASSES =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

/** Approved partners only; guests contact them directly (hotel never brokers). */
export function ConciergeSection({
  approved,
  dict,
  lang,
  tpl,
}: {
  approved: PartnerRow[];
  dict: Dictionary;
  lang: string;
  tpl: TemplateDef;
}) {
  if (approved.length === 0) return null;
  const s = dict.sections;

  return (
    <SectionShell tpl={tpl} id="concierge" title={s.conciergeTitle}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {approved.map((partner) => (
          <li
            key={partner.id}
            className={`flex flex-col ${tpl.t.card} p-5`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {s.partnerCategories[partner.category]}
            </p>
            <h3 className="mt-1 text-lg font-semibold [font-family:var(--font-heading)]">
              {partner.name}
            </h3>
            {partner.blurb ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {partner.blurb}
              </p>
            ) : null}
            {partner.priceNote ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                {partner.priceNote}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 pt-1">
              {partner.whatsappE164 ? (
                <a
                  href={`https://wa.me/${partner.whatsappE164.replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ACTION_CLASSES}
                >
                  {s.conciergeWhatsApp}
                  <span className="sr-only"> {partner.name} (opens in new tab)</span>
                </a>
              ) : null}
              {partner.phone ? (
                <a href={`tel:${partner.phone}`} className={ACTION_CLASSES}>
                  {s.conciergeCall}
                  <span className="sr-only"> {partner.name}</span>
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4">
        <Link
          href={`/${lang}/partners/apply`}
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {dict.partnerApply.title} →
        </Link>
      </p>
    </SectionShell>
  );
}
