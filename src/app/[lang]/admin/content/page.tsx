import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listEditableSections } from "@/lib/admin/content";
import { requireStaffPage } from "@/lib/admin/guard";
import { hasCloudinary } from "@/lib/media/cloudinary";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { saveSectionAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Content" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function AdminContentPage({
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
  const a = dict.admin.content;
  const sp = await searchParams;
  const sections = await listEditableSections(ctx.tenant.id);

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>
      {!hasCloudinary() ? (
        <p className="mt-2 max-w-xl text-xs text-slate-500">{a.mediaPending}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        {sections.map(({ key, row }) => {
          const data = (row?.data ?? {}) as Record<string, string>;
          return (
            <section
              key={key}
              aria-label={a.sectionNames[key]}
              className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            >
              <h2 className="text-lg font-semibold">{a.sectionNames[key]}</h2>
              <form action={saveSectionAction} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="key" value={key} />
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${key}-title`} className="text-sm font-medium">
                    {a.titleField}
                  </label>
                  <input
                    id={`${key}-title`}
                    name="title"
                    defaultValue={row?.title ?? ""}
                    className={INPUT}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${key}-body`} className="text-sm font-medium">
                    {a.bodyField}
                  </label>
                  <textarea
                    id={`${key}-body`}
                    name="body"
                    rows={5}
                    defaultValue={row?.body ?? ""}
                    className="rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                {key === "hero" ? (
                  <div className="flex flex-wrap gap-4">
                    <div className="flex min-w-64 flex-1 flex-col gap-1">
                      <label htmlFor="hero-imageUrl" className="text-sm font-medium">
                        {a.imageUrlField}
                      </label>
                      <input
                        id="hero-imageUrl"
                        name="imageUrl"
                        type="url"
                        defaultValue={data.imageUrl ?? ""}
                        className={INPUT}
                      />
                    </div>
                    <div className="flex min-w-64 flex-1 flex-col gap-1">
                      <label htmlFor="hero-imageAlt" className="text-sm font-medium">
                        {a.imageAltField}
                      </label>
                      <input
                        id="hero-imageAlt"
                        name="imageAlt"
                        defaultValue={data.imageAlt ?? ""}
                        className={INPUT}
                      />
                    </div>
                  </div>
                ) : null}
                {key === "virtual_tour" ? (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tour-embedUrl" className="text-sm font-medium">
                      {a.embedUrlField}
                    </label>
                    <input
                      id="tour-embedUrl"
                      name="embedUrl"
                      type="url"
                      defaultValue={data.embedUrl ?? ""}
                      className={INPUT}
                    />
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4">
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
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                    style={{
                      background: "var(--brand-accent)",
                      color: "var(--brand-accent-fg)",
                    }}
                  >
                    {a.save}
                    <span className="sr-only"> {a.sectionNames[key]}</span>
                  </button>
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
