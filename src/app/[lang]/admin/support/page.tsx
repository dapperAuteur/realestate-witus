import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { listThreadsForUser } from "@/lib/support";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { AttachmentUpload } from "@/components/attachment-upload";
import { hasCloudinary } from "@/lib/media/cloudinary";
import { createThreadAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";
const CATEGORIES = [
  "bug",
  "ui_ux",
  "feature_request",
  "question",
  "content",
  "billing",
  "other",
] as const;

export default async function AdminSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("front_desk", lang);
  const s = dict.admin.support;
  const sp = await searchParams;
  const threads = await listThreadsForUser(ctx.tenant.id, ctx.user.id);

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{s.intro}</p>

      <section
        aria-label={s.newTitle}
        className="mt-6 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700"
      >
        <h2 className="text-lg font-semibold">{s.newTitle}</h2>
        <form action={createThreadAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <label htmlFor="su-subject" className="text-sm font-medium">
                {s.subjectField}
              </label>
              <input id="su-subject" name="subject" required className={INPUT} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="su-category" className="text-sm font-medium">
                {s.categoryField}
              </label>
              <select id="su-category" name="category" className={INPUT}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {s.categories[category]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="su-body" className="text-sm font-medium">
              {s.bodyField}
            </label>
            <textarea
              id="su-body"
              name="body"
              rows={4}
              required
              className="rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="su-rec" className="text-sm font-medium">
              {s.recordingField}
            </label>
            <input id="su-rec" name="recordingUrl" type="url" className={INPUT} />
          </div>
          {hasCloudinary() ? (
            <AttachmentUpload
              name="screenshotMediaId"
              labels={{
                field: s.screenshotField,
                upload: s.screenshotUpload,
                uploading: s.screenshotUploading,
                done: s.screenshotDone,
                failed: s.screenshotFailed,
              }}
            />
          ) : null}
          <button
            type="submit"
            className="inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {s.open}
          </button>
        </form>
      </section>

      {threads.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{s.empty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {threads.map((thread) => (
            <li
              key={thread.id}
              className="relative rounded-xl border border-slate-200 p-4 transition-shadow focus-within:ring-2 focus-within:ring-current hover:shadow-md dark:border-slate-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  <Link
                    href={`/${lang}/admin/support/${thread.id}`}
                    className="after:absolute after:inset-0 focus:outline-none"
                  >
                    {thread.subject}
                  </Link>
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  {s.categories[thread.category]} · {s.statuses[thread.status]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
