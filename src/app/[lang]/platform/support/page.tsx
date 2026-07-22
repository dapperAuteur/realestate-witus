import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { requirePlatformPage } from "@/lib/platform/guard";
import { listThreadsAdmin } from "@/lib/support";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support" };

export default async function PlatformSupportPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await requirePlatformPage();
  const dict = await getDictionary(lang);
  const d = dict.platform.supportPage;
  const s = dict.admin.support;
  const rows = await listThreadsAdmin();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}/platform`} className="underline underline-offset-4">
          {dict.platform.title}
        </Link>{" "}
        / {d.title}
      </p>
      <h1 className="mt-2 text-2xl font-bold">{d.title}</h1>
      <p className="mt-1 max-w-xl text-xs text-slate-500">{d.queueHint}</p>

      {rows.length === 0 ? (
        <p className="mt-6 text-slate-600 dark:text-slate-400">{d.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map(({ thread, tenantName }) => (
            <li
              key={thread.id}
              className="relative rounded-xl border border-slate-200 p-4 transition-shadow focus-within:ring-2 focus-within:ring-current hover:shadow-md dark:border-slate-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">
                  <Link
                    href={`/${lang}/platform/support/${thread.id}`}
                    className="after:absolute after:inset-0 focus:outline-none"
                  >
                    {thread.subject}
                  </Link>
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  {tenantName} · {s.categories[thread.category]} ·{" "}
                  {s.statuses[thread.status]}
                </p>
              </div>
              {thread.userDisputeReason && thread.status === "resolved_user_disputed" ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {thread.userDisputeReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
