import type { siteSections } from "@/db/schema";
import { Paragraphs } from "./paragraphs";
import type { TemplateDef } from "@/lib/templates";
import { SectionShell } from "./section-shell";

type SiteSectionRow = typeof siteSections.$inferSelect;

/** about + dining v1: an owner-written title/body block. Null until published. */
export function TextSection({
  id,
  fallbackTitle,
  row,
  tpl,
}: {
  id: string;
  fallbackTitle: string;
  row: SiteSectionRow | undefined;
  tpl: TemplateDef;
}) {
  if (!row?.body) return null;
  return (
    <SectionShell tpl={tpl} id={id} title={row.title ?? fallbackTitle}>
      <div className="max-w-2xl">
        <Paragraphs text={row.body} />
      </div>
    </SectionShell>
  );
}
