import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listAudit } from "@/lib/audit";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { requirePlatformPage } from "@/lib/platform/guard";
import { listTenantsAdmin } from "@/lib/platform/tenants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Logs" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function PlatformLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tenant?: string; kind?: string; before?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await requirePlatformPage();
  const dict = await getDictionary(lang);
  const d = dict.platform.logsPage;
  const sp = await searchParams;

  const tenants = await listTenantsAdmin();
  const before = sp.before ? new Date(sp.before) : undefined;
  const rows = await listAudit({
    tenantId: sp.tenant || undefined,
    kindPrefix: sp.kind || undefined,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    limit: 50,
  });
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const oldest = rows[rows.length - 1]?.createdAt;
  const olderHref = oldest
    ? `/${lang}/platform/logs?tenant=${sp.tenant ?? ""}&kind=${sp.kind ?? ""}&before=${encodeURIComponent(oldest.toISOString())}`
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}/platform`} className="underline underline-offset-4">
          {dict.platform.title}
        </Link>{" "}
        / {d.title}
      </p>
      <h1 className="mt-2 text-2xl font-bold">{d.title}</h1>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="lg-tenant" className="text-sm font-medium">
            {dict.platform.tenantsPage.title}
          </label>
          <select id="lg-tenant" name="tenant" defaultValue={sp.tenant ?? ""} className={INPUT}>
            <option value="">{d.allTenants}</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lg-kind" className="text-sm font-medium">{d.kindField}</label>
          <input
            id="lg-kind"
            name="kind"
            defaultValue={sp.kind ?? ""}
            placeholder="billing."
            className={INPUT}
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium dark:border-slate-700"
        >
          {d.filter}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-6 text-slate-600 dark:text-slate-400">{d.empty}</p>
      ) : (
        <ol className="mt-6 flex flex-col divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
              <time
                dateTime={row.createdAt.toISOString()}
                className="font-mono text-xs text-slate-500"
              >
                {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </time>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                {row.kind}
              </code>
              <span>{row.summary}</span>
              {row.tenantId ? (
                <span className="text-xs text-slate-500">
                  {tenantName.get(row.tenantId) ?? row.tenantId.slice(0, 8)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {olderHref && rows.length === 50 ? (
        <p className="mt-6">
          <Link
            href={olderHref}
            className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium dark:border-slate-700"
          >
            {d.older}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
