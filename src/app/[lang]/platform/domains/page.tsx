import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { hasVercelDomains } from "@/lib/env";
import { listTenantsWithDomains } from "@/lib/platform/domains";
import { requirePlatformPage } from "@/lib/platform/guard";
import { getDomainStatus } from "@/lib/vercel-domains";
import { CopyButton } from "@/components/copy-button";
import {
  addDomainAction,
  checkDomainAction,
  removeDomainAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Domains" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

export default async function PlatformDomainsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ host?: string; ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await requirePlatformPage();
  const dict = await getDictionary(lang);
  const d = dict.platform.domains;

  const { host, ok, error } = await searchParams;
  const rows = await listTenantsWithDomains();
  const status = host && hasVercelDomains ? await getDomainStatus(host) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}/platform`} className="underline underline-offset-4">
          {dict.platform.title}
        </Link>{" "}
        / {d.title}
      </p>
      <h1 className="mt-2 text-2xl font-bold">{d.title}</h1>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error in d.errors ? d.errors[error as keyof typeof d.errors] : d.errors.GENERIC}
        </p>
      ) : ok ? (
        <p role="status" className="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          {d.saved}
        </p>
      ) : null}

      {!hasVercelDomains ? (
        <p className="mt-4 max-w-xl text-sm text-slate-500">{d.vercelPending}</p>
      ) : null}

      {host ? (
        <section
          aria-label={d.statusFor}
          className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
        >
          <h2 className="text-lg font-semibold">
            {d.statusFor} <code className="font-mono">{host}</code>
          </h2>
          {status?.verified ? (
            <p role="status" className="mt-2 text-sm font-medium" style={{ color: "var(--brand-accent)" }}>
              {d.verified}
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {d.pendingDns}
              </p>
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
                <li>{d.step1}</li>
                <li>
                  {d.step2}
                  {status?.verification?.length ? (
                    <ul className="mt-2 space-y-3">
                      {status.verification.map((record) => (
                        <li key={`${record.type}-${record.domain}`} className="flex flex-col gap-1">
                          <span className="text-xs text-slate-500">
                            {d.recordType}: <strong className="font-mono">{record.type}</strong>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {d.recordName}: <CopyButton value={record.domain} label={d.recordName} />
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {d.recordValue}: <CopyButton value={record.value} label={d.recordValue} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {d.cnameHint} <CopyButton value="cname.vercel-dns.com" label={d.recordValue} />
                    </span>
                  )}
                </li>
                <li>{d.step3}</li>
              </ol>
              <form action={checkDomainAction} className="mt-4">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="host" value={host} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                  style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                >
                  {d.checkAgain}
                  <span className="sr-only"> {host}</span>
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}

      <div className="mt-8 flex flex-col gap-6">
        {rows.map((tenant) => (
          <section
            key={tenant.id}
            aria-label={tenant.name}
            className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
          >
            <h2 className="text-lg font-semibold">
              {tenant.name}{" "}
              <code className="text-xs font-normal text-slate-500">{tenant.slug}</code>
            </h2>
            {tenant.domains.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{d.noDomains}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {tenant.domains.map((domain) => (
                  <li
                    key={domain.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <a
                      href={`https://${domain.host}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline underline-offset-4"
                    >
                      {domain.host}
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                    <span className="flex gap-2">
                      <form action={checkDomainAction}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="host" value={domain.host} />
                        <button type="submit" className={BUTTON}>
                          {d.check}
                          <span className="sr-only"> {domain.host}</span>
                        </button>
                      </form>
                      <form action={removeDomainAction}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <input type="hidden" name="domainId" value={domain.id} />
                        <button type="submit" className={BUTTON}>
                          {d.remove}
                          <span className="sr-only"> {domain.host}</span>
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section
        aria-label={d.addTitle}
        className="mt-8 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700"
      >
        <h2 className="text-lg font-semibold">{d.addTitle}</h2>
        <form action={addDomainAction} className="mt-4 flex flex-wrap items-end gap-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="flex flex-col gap-1">
            <label htmlFor="dom-tenant" className="text-sm font-medium">
              {d.tenantField}
            </label>
            <select id="dom-tenant" name="tenantId" className={INPUT}>
              {rows.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <label htmlFor="dom-host" className="text-sm font-medium">
              {d.hostField}
            </label>
            <input
              id="dom-host"
              name="host"
              required
              placeholder="demo.stay.witus.online"
              className={INPUT}
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {d.add}
          </button>
        </form>
      </section>
    </main>
  );
}
