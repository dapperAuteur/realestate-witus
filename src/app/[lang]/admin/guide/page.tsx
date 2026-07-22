import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ATTRACTION_CATEGORIES,
  ATTRACTION_ZONES,
  listAttractions,
} from "@/lib/admin/content";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import {
  createAttractionAction,
  deleteAttractionAction,
  updateAttractionAction,
} from "../actions";
import { Flash } from "../flash";
import type { attractions } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guide" };

type AttractionRow = typeof attractions.$inferSelect;
type GuideDict = Awaited<
  ReturnType<typeof getDictionary>
>["admin"]["guide"];

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

function AttractionFields({
  a,
  row,
  idPrefix,
}: {
  a: GuideDict;
  row: AttractionRow | null;
  idPrefix: string;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
            {a.nameField}
          </label>
          <input
            id={`${idPrefix}-name`}
            name="name"
            required
            defaultValue={row?.name ?? ""}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-zone`} className="text-sm font-medium">
            {a.zoneField}
          </label>
          <select
            id={`${idPrefix}-zone`}
            name="zone"
            defaultValue={row?.zone ?? "walkable"}
            className={INPUT}
          >
            {ATTRACTION_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {a.zones[zone]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium">
            {a.categoryField}
          </label>
          <select
            id={`${idPrefix}-category`}
            name="category"
            defaultValue={row?.category ?? "other"}
            className={INPUT}
          >
            {ATTRACTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {a.categories[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-walk`} className="text-sm font-medium">
            {a.walkField}
          </label>
          <input
            id={`${idPrefix}-walk`}
            name="walkMinutes"
            type="number"
            min={1}
            defaultValue={row?.walkMinutes ?? ""}
            className={`${INPUT} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-drive`} className="text-sm font-medium">
            {a.driveField}
          </label>
          <input
            id={`${idPrefix}-drive`}
            name="driveMinutes"
            type="number"
            min={1}
            defaultValue={row?.driveMinutes ?? ""}
            className={`${INPUT} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-sort`} className="text-sm font-medium">
            {a.sortField}
          </label>
          <input
            id={`${idPrefix}-sort`}
            name="sortOrder"
            type="number"
            defaultValue={row?.sortOrder ?? 0}
            className={`${INPUT} w-24`}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-blurb`} className="text-sm font-medium">
          {a.blurbField}
        </label>
        <textarea
          id={`${idPrefix}-blurb`}
          name="blurb"
          rows={2}
          defaultValue={row?.blurb ?? ""}
          className="rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-map`} className="text-sm font-medium">
          {a.mapField}
        </label>
        <input
          id={`${idPrefix}-map`}
          name="mapUrl"
          type="url"
          defaultValue={row?.mapUrl ?? ""}
          className={INPUT}
        />
      </div>
      <label className="inline-flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPublished"
          value="1"
          defaultChecked={row?.isPublished ?? false}
          className="h-4 w-4"
        />
        {a.publishedField}
      </label>
    </>
  );
}

export default async function AdminGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("manager", lang);
  const a = dict.admin.guide;
  const sp = await searchParams;
  const rows = await listAttractions(ctx.tenant.id);

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>

      <div className="mt-6 flex flex-col gap-6">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{a.empty}</p>
        ) : (
          rows.map((row) => (
            <section
              key={row.id}
              aria-label={row.name}
              className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            >
              <form action={updateAttractionAction} className="flex flex-col gap-4">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="id" value={row.id} />
                <AttractionFields a={a} row={row} idPrefix={row.id.slice(0, 8)} />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                    style={{
                      background: "var(--brand-accent)",
                      color: "var(--brand-accent-fg)",
                    }}
                  >
                    {a.save}
                    <span className="sr-only"> {row.name}</span>
                  </button>
                  <button
                    type="submit"
                    formAction={deleteAttractionAction}
                    className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium dark:border-slate-700"
                  >
                    {a.delete}
                    <span className="sr-only"> {row.name}</span>
                  </button>
                </div>
              </form>
            </section>
          ))
        )}

        <section
          aria-label={a.add}
          className="rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700"
        >
          <h2 className="text-lg font-semibold">{a.add}</h2>
          <form action={createAttractionAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="lang" value={lang} />
            <AttractionFields a={a} row={null} idPrefix="new" />
            <button
              type="submit"
              className="inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              style={{
                background: "var(--brand-accent)",
                color: "var(--brand-accent-fg)",
              }}
            >
              {a.create}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
