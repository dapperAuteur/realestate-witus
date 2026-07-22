import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { localToday } from "@/lib/admin/today";
import {
  audienceRecipients,
  listAnnouncements,
  whatsAppShareUrl,
  type Audience,
} from "@/lib/campaigns";
import { CopyButton } from "@/components/copy-button";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import {
  createAnnouncementAction,
  publishAnnouncementAction,
  sendAnnouncementAction,
} from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Announce" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

const AUDIENCES: Audience[] = [
  "past_guests",
  "upcoming_guests",
  "current_guests",
  "all_subscribers",
];

export default async function AdminAnnouncePage({
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
  const a = dict.admin.announce;
  const sp = await searchParams;

  const today = localToday("Africa/Accra");
  const [rows, ...counts] = await Promise.all([
    listAnnouncements(ctx.tenant.id),
    ...AUDIENCES.map((audience) =>
      audienceRecipients(ctx.tenant.id, audience, today)
        .then((r) => r.length)
        .catch(() => 0),
    ),
  ]);
  const countByAudience = Object.fromEntries(
    AUDIENCES.map((audience, i) => [audience, counts[i]]),
  ) as Record<Audience, number>;
  const siteUrl = `https://${ctx.tenant.slug === "bam-hotel" ? "demo.stay.witus.online" : "stay.witus.online"}/${lang}`;

  const sentFlash = sp.ok?.startsWith("sent:") ? sp.ok.slice(5) : null;

  return (
    <div>
      {sentFlash !== null ? (
        <p role="status" className="mb-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          {a.sentFlash} {sentFlash}
        </p>
      ) : (
        <Flash ok={sp.ok} error={sp.error} dict={dict} />
      )}
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>

      <section
        aria-label={a.composeTitle}
        className="mt-6 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700"
      >
        <h2 className="text-lg font-semibold">{a.composeTitle}</h2>
        <form action={createAnnouncementAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="flex flex-col gap-1">
            <label htmlFor="an-title" className="text-sm font-medium">
              {a.titleField}
            </label>
            <input id="an-title" name="title" required className={INPUT} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="an-body" className="text-sm font-medium">
              {a.bodyField}
            </label>
            <textarea
              id="an-body"
              name="body"
              rows={4}
              required
              className="rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="an-audience" className="text-sm font-medium">
                {a.audienceField}
              </label>
              <select id="an-audience" name="audience" className={INPUT}>
                {AUDIENCES.map((audience) => (
                  <option key={audience} value={audience}>
                    {a.audiences[audience]} ({countByAudience[audience]} {a.optedIn})
                  </option>
                ))}
              </select>
            </div>
            <label className="inline-flex min-h-11 items-center gap-2 self-end text-sm">
              <input type="checkbox" name="urgency" value="urgent" className="h-4 w-4" />
              {a.urgentField}
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {a.saveDraft}
          </button>
        </form>
      </section>

      <ul className="mt-8 flex flex-col gap-4">
        {rows.map((row) => {
          const wa = whatsAppShareUrl({ title: row.title, body: row.body, siteUrl });
          return (
            <li
              key={row.id}
              className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  {row.title}
                  {row.urgency === "urgent" ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      {a.urgentBadge}
                    </span>
                  ) : null}
                </h3>
                <p className="text-xs text-slate-500">
                  {a.audiences[row.audience]} ·{" "}
                  {row.sentAt ? a.statusSent : row.publishedAt ? a.statusPublished : a.statusDraft}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
                {row.body}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={sendAnnouncementAction}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="announcementId" value={row.id} />
                  <button type="submit" className={BUTTON}>
                    {row.sentAt ? a.resend : a.send}
                    <span className="sr-only"> {row.title}</span>
                  </button>
                </form>
                <form action={publishAnnouncementAction}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="announcementId" value={row.id} />
                  <input type="hidden" name="publish" value={row.publishedAt ? "0" : "1"} />
                  <button type="submit" className={BUTTON}>
                    {row.publishedAt ? a.unpublish : a.publish}
                    <span className="sr-only"> {row.title}</span>
                  </button>
                </form>
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BUTTON}
                >
                  {a.whatsapp}
                  <span className="sr-only"> {row.title} (opens in new tab)</span>
                </a>
                <CopyButton value={`${row.title}\n\n${row.body}\n\n${siteUrl}`} label={a.copyText} />
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="text-sm text-slate-500">{a.empty}</li>
        ) : null}
      </ul>
    </div>
  );
}
