import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupportThreadMessages } from "@/components/support-thread";
import { requireStaffPage } from "@/lib/admin/guard";
import { getThread } from "@/lib/support";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { confirmResolutionAction, replyThreadAction } from "../../actions";
import { Flash } from "../../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support thread" };

export default async function AdminSupportThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("front_desk", lang);
  const s = dict.admin.support;
  const sp = await searchParams;

  const data = await getThread({
    threadId: id,
    viewer: { userId: ctx.user.id, isPlatformAdmin: false, tenantId: ctx.tenant.id },
  });
  if (!data) notFound();
  const { thread, messages } = data;

  return (
    <div>
      <p className="text-sm">
        <Link href={`/${lang}/admin/support`} className="underline underline-offset-4">
          {dict.admin.nav.support}
        </Link>{" "}
        / {thread.subject}
      </p>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <h2 className="mt-2 text-xl font-bold">{thread.subject}</h2>
      <p className="mt-1 text-xs font-medium text-slate-500">
        {s.categories[thread.category]} · {s.statuses[thread.status]}
      </p>

      <SupportThreadMessages messages={messages} dict={dict} viewerIsAdmin={false} />

      {thread.status === "resolved_pending_confirm" ? (
        <section
          aria-label={s.confirmPrompt}
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/40"
        >
          <p className="text-sm font-medium">{s.confirmPrompt}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <form action={confirmResolutionAction}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="threadId" value={thread.id} />
              <input type="hidden" name="confirmed" value="1" />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
              >
                {s.confirmYes}
              </button>
            </form>
            <form action={confirmResolutionAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="threadId" value={thread.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="dispute" className="text-xs font-medium">
                  {s.disputeField}
                </label>
                <input
                  id="dispute"
                  name="disputeReason"
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium dark:border-slate-700"
              >
                {s.confirmNo}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {thread.status !== "closed" ? (
        <form action={replyThreadAction} className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="threadId" value={thread.id} />
          <label htmlFor="reply" className="text-sm font-medium">
            {s.replyField}
          </label>
          <textarea
            id="reply"
            name="body"
            rows={3}
            required
            className="rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {s.reply}
          </button>
        </form>
      ) : null}
    </div>
  );
}
