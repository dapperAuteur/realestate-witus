import type { siteSections } from "@/db/schema";
import type { Dictionary } from "@/lib/dictionaries";
import { Paragraphs } from "./paragraphs";
import type { TemplateDef } from "@/lib/templates";
import { SectionShell } from "./section-shell";

type SiteSectionRow = typeof siteSections.$inferSelect;

/** RealSee 360° tour. v1 links out; an inline embed weighs mobile pages down. */
export function TourSection({
  row,
  dict,
  tpl,
}: {
  row: SiteSectionRow | undefined;
  dict: Dictionary;
  tpl: TemplateDef;
}) {
  const data = (row?.data ?? {}) as { embedUrl?: string };
  if (!row || !data.embedUrl) return null;
  const s = dict.sections;

  return (
    <SectionShell tpl={tpl} id="tour" title={row.title ?? s.tourTitle}>
      {row.body ? (
        <div className="max-w-2xl">
          <Paragraphs text={row.body} />
        </div>
      ) : null}
      <a
        href={data.embedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        style={{
          background: "var(--brand-accent)",
          color: "var(--brand-accent-fg)",
        }}
      >
        {s.tourCta}
        <span className="sr-only"> (opens in new tab)</span>
      </a>
    </SectionShell>
  );
}
