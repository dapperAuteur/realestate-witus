import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupportThreadMessages } from "@/components/support-thread";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { requirePlatformPage } from "@/lib/platform/guard";
import { getThread } from "@/lib/support";
import {
  adminReplyAction,
  closeThreadAction,
  resolveThreadAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support thread" };

export default async function PlatformSupportThreadPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const user = await requirePlatformPage();
  const dict = await getDictionary(lang);
  const s = dict.admin.support;
  const d = dict.platform.supportPage;

  const data = await getThread({
    threadId: id,
    viewer: { userId: user?.id ?? "", isPlatformAdmin: true },
  });
  if (!data) notFound();
  const { thread, messages } = data;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}/platform/support`} className="underline underline-offset-4">
          {d.title}
        </Link>{" "}
        / {thread.subject}
      </p>
      <h1 className="mt-2 text-xl font-bold">{thread.subject}</h1>
      <p className="mt-1 text-xs font-medium text-slate-500">
        {s.categories[thread.category]} · {s.statuses[thread.status]} ·{" "}
        {thread.priority}
      </p>
      {thread.userDisputeReason ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          {thread.userDisputeReason}
        </p>
      ) : null}

      <SupportThreadMessages messages={messages} dict={dict} viewerIsAdmin />

      {thread.status !== "closed" ? (
        <>
          <form action={adminReplyAction} className="mt-6 flex flex-col gap-3">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={resolveThreadAction}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="threadId" value={thread.id} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium dark:border-slate-700"
              >
                {d.resolve}
              </button>
            </form>
            <form action={closeThreadAction}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="threadId" value={thread.id} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium dark:border-slate-700"
              >
                {d.close}
              </button>
            </form>
          </div>
        </>
      ) : null}
    </main>
  );
}
