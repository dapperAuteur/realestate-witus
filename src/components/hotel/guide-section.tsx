import type { attractions } from "@/db/schema";
import type { Dictionary } from "@/lib/dictionaries";
import type { TemplateDef } from "@/lib/templates";
import { SectionShell } from "./section-shell";

type AttractionRow = typeof attractions.$inferSelect;

export function GuideSection({
  published,
  dict,
  tpl,
}: {
  published: AttractionRow[];
  dict: Dictionary;
  tpl: TemplateDef;
}) {
  if (published.length === 0) return null;
  const s = dict.sections;

  return (
    <SectionShell tpl={tpl} id="guide" title={s.guideTitle}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {published.map((spot) => (
          <li
            key={spot.id}
            className={`${tpl.t.card} p-5`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {spot.zone === "walkable" ? s.guideWalkable : s.guideDayTrip}
              {spot.zone === "walkable" && spot.walkMinutes ? (
                <> · {spot.walkMinutes} {s.guideMinutesWalk}</>
              ) : null}
              {spot.zone === "day_trip" && spot.driveMinutes ? (
                <> · {spot.driveMinutes} {s.guideMinutesDrive}</>
              ) : null}
            </p>
            <h3 className="mt-1 text-lg font-semibold [font-family:var(--font-heading)]">
              {spot.name}
            </h3>
            {spot.blurb ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {spot.blurb}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
