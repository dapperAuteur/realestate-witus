import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import {
  getTenantBilling,
  listInvoicesForTenant,
  pendingMomoQueue,
} from "@/lib/platform/billing";
import { requirePlatformPage } from "@/lib/platform/guard";
import { listTenantsAdmin } from "@/lib/platform/tenants";
import {
  confirmInvoiceAction,
  createInvoiceAction,
  savePricingAction,
  voidInvoiceAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

export default async function PlatformBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tenant?: string; ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await requirePlatformPage();
  const dict = await getDictionary(lang);
  const d = dict.platform.billingPage;
  const sp = await searchParams;

  const tenantRows = (await listTenantsAdmin()).filter((t) => !t.flags.platform);
  const selectedId =
    tenantRows.find((t) => t.id === sp.tenant)?.id ?? tenantRows[0]?.id;
  const selected = tenantRows.find((t) => t.id === selectedId);
  const [queue, billing, invoices] = await Promise.all([
    pendingMomoQueue(),
    selectedId ? getTenantBilling(selectedId) : null,
    selectedId ? listInvoicesForTenant(selectedId) : [],
  ]);
  const self = `/${lang}/platform/billing?tenant=${selectedId ?? ""}`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}/platform`} className="underline underline-offset-4">
          {dict.platform.title}
        </Link>{" "}
        / {d.title}
      </p>
      <h1 className="mt-2 text-2xl font-bold">{d.title}</h1>

      {sp.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {sp.error in d.errors ? d.errors[sp.error as keyof typeof d.errors] : d.errors.GENERIC}
        </p>
      ) : sp.ok ? (
        <p role="status" className="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          {dict.platform.domains.saved}
        </p>
      ) : null}

      <section aria-label={d.queueTitle} className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="text-lg font-semibold">{d.queueTitle}</h2>
        {queue.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{d.queueEmpty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {queue.map(({ invoice, tenantName }) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong className="font-mono">{invoice.code}</strong> · {tenantName} ·{" "}
                  {formatMoneyMinor(invoice.amountMinor, invoice.currency)} · {d.claimedAt}{" "}
                  {invoice.momoClaimedAt?.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <form action={confirmInvoiceAction}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="back" value={self} />
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <input type="hidden" name="method" value="momo" />
                  <button type="submit" className={BUTTON}>
                    {d.confirm}
                    <span className="sr-only"> {invoice.code}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="tenant" className="text-sm font-medium">
            {dict.platform.tenantsPage.title}
          </label>
          <select id="tenant" name="tenant" defaultValue={selectedId} className={INPUT}>
            {tenantRows.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className={BUTTON}>
          {dict.admin.pricing.show}
        </button>
      </form>

      {selected ? (
        <>
          <section aria-label={d.pricingTitle} className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-lg font-semibold">{d.pricingTitle} — {selected.name}</h2>
            <form action={savePricingAction} className="mt-4 flex flex-wrap items-end gap-4">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="back" value={self} />
              <input type="hidden" name="tenantId" value={selected.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="pr-setup" className="text-sm font-medium">{d.setupField}</label>
                <input id="pr-setup" name="setupFeeMinor" type="number" min={0} defaultValue={billing?.setupFeeMinor ?? 0} className={`${INPUT} w-32`} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pr-monthly" className="text-sm font-medium">{d.monthlyField}</label>
                <input id="pr-monthly" name="monthlyFeeMinor" type="number" min={0} defaultValue={billing?.monthlyFeeMinor ?? 0} className={`${INPUT} w-32`} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pr-cur" className="text-sm font-medium">{d.currencyField}</label>
                <input id="pr-cur" name="currency" defaultValue={billing?.currency ?? "USD"} className={`${INPUT} w-24`} />
              </div>
              <div className="flex min-w-56 flex-1 flex-col gap-1">
                <label htmlFor="pr-email" className="text-sm font-medium">{d.emailField}</label>
                <input id="pr-email" name="billingEmail" type="email" defaultValue={billing?.billingEmail ?? ""} className={INPUT} />
              </div>
              <div className="flex min-w-56 flex-1 flex-col gap-1">
                <label htmlFor="pr-notes" className="text-sm font-medium">{d.notesField}</label>
                <input id="pr-notes" name="notes" defaultValue={billing?.notes ?? ""} className={INPUT} />
              </div>
              <button type="submit" className={BUTTON}>{d.savePricing}</button>
            </form>
          </section>

          <section aria-label={d.invoicesTitle} className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-lg font-semibold">{d.invoicesTitle}</h2>
            <form action={createInvoiceAction} className="mt-4 flex flex-wrap items-end gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="back" value={self} />
              <input type="hidden" name="tenantId" value={selected.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="in-kind" className="text-sm font-medium">{d.kindField}</label>
                <select id="in-kind" name="kind" className={INPUT}>
                  {(["monthly", "setup", "custom"] as const).map((kind) => (
                    <option key={kind} value={kind}>{d.kinds[kind]}</option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <label htmlFor="in-desc" className="text-sm font-medium">{d.descriptionField}</label>
                <input id="in-desc" name="description" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="in-amount" className="text-sm font-medium">{d.amountField}</label>
                <input id="in-amount" name="amountMinor" type="number" min={1} required className={`${INPUT} w-32`} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="in-cur" className="text-sm font-medium">{d.currencyField}</label>
                <input id="in-cur" name="currency" defaultValue={billing?.currency ?? "USD"} className={`${INPUT} w-24`} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="in-due" className="text-sm font-medium">{d.dueField}</label>
                <input id="in-due" name="dueDate" type="date" className={INPUT} />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
              >
                {d.send}
              </button>
            </form>

            {invoices.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">{dict.admin.billing.empty}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <strong className="font-mono">{invoice.code}</strong> ·{" "}
                      {formatMoneyMinor(invoice.amountMinor, invoice.currency)} ·{" "}
                      {d.statuses[invoice.status]}
                      {invoice.momoClaimedAt && invoice.status === "sent" ? " · claimed" : ""}
                      {invoice.dueDate ? ` · ${dict.admin.billing.due} ${invoice.dueDate}` : ""}
                    </span>
                    {invoice.status === "sent" || invoice.status === "overdue" ? (
                      <span className="flex gap-2">
                        <form action={confirmInvoiceAction}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="back" value={self} />
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <input type="hidden" name="method" value="other" />
                          <button type="submit" className={BUTTON}>
                            {d.markPaid}
                            <span className="sr-only"> {invoice.code}</span>
                          </button>
                        </form>
                        <form action={voidInvoiceAction}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="back" value={self} />
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <button type="submit" className={BUTTON}>
                            {d.void}
                            <span className="sr-only"> {invoice.code}</span>
                          </button>
                        </form>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
