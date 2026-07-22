import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { env } from "@/lib/env";
import { formatMoneyMinor } from "@/lib/money";
import { listInvoicesForTenant } from "@/lib/platform/billing";
import { claimInvoiceAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing" };

// Owner-side platform billing (owner role only): see invoices from
// Stay.WitUS, pay by MoMo with the invoice code as reference, tap
// "I've sent it". Copy buttons on number + reference (minimize-error rule).

export default async function AdminBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("owner", lang);
  const a = dict.admin.billing;
  const sp = await searchParams;
  const invoices = await listInvoicesForTenant(ctx.tenant.id);
  const momoReady = Boolean(env.PLATFORM_MOMO_NUMBER && env.PLATFORM_MOMO_NAME);

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>

      {invoices.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{a.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {invoices.map((invoice) => {
            const open = invoice.status === "sent" || invoice.status === "overdue";
            const claimed = Boolean(invoice.momoClaimedAt);
            return (
              <li
                key={invoice.id}
                className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono font-semibold">{invoice.code}</p>
                  <p className="text-sm">
                    <strong>{formatMoneyMinor(invoice.amountMinor, invoice.currency)}</strong>{" "}
                    <span className="text-slate-500">
                      ·{" "}
                      {invoice.status === "paid"
                        ? a.paid
                        : claimed
                          ? a.statusClaimed
                          : a.statusSent}
                      {invoice.dueDate ? ` · ${a.due} ${invoice.dueDate}` : ""}
                    </span>
                  </p>
                </div>
                {invoice.description ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {invoice.description}
                  </p>
                ) : null}

                {open && !claimed && momoReady ? (
                  <div className="mt-4 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
                    <p className="font-semibold">{a.momoTitle}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      {a.momoSend}{" "}
                      <CopyButton
                        value={env.PLATFORM_MOMO_NUMBER as string}
                        label={a.momoSend}
                      />
                      <span>({env.PLATFORM_MOMO_NAME})</span>
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      {a.momoRef} <CopyButton value={invoice.code} label={a.momoRef} />
                    </p>
                    <form action={claimInvoiceAction} className="mt-3">
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                        style={{
                          background: "var(--brand-accent)",
                          color: "var(--brand-accent-fg)",
                        }}
                      >
                        {a.claim}
                        <span className="sr-only"> {invoice.code}</span>
                      </button>
                    </form>
                  </div>
                ) : null}
                {open && claimed ? (
                  <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    {a.claimed}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
