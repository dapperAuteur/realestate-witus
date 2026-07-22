import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancellationPolicyText } from "@/lib/booking/policy";
import { getReservationSummaryByCode } from "@/lib/booking/summaries";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import { resolveTenant } from "@/lib/tenant";
import { payNowAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reservation" };

// Landing after confirm and after the Paystack callback. Payment truth comes
// from the webhook-updated reservation row, not from callback query params —
// if the webhook has not landed yet the page says "processing".

export default async function BookDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ code?: string; pay?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const b = dict.book;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) notFound();

  const { code, pay } = await searchParams;
  const summary = code
    ? await getReservationSummaryByCode({ tenantId: tenant.id, code })
    : null;

  if (!summary?.ok) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{b.notFoundTitle}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{b.notFoundBody}</p>
      </main>
    );
  }
  const r = summary.data;
  const policyText = cancellationPolicyText(r.cancellationPolicySnapshot, {
    freeUntil: b.policyFreeUntil,
    freeAlways: b.policyFreeAlways,
    penaltyAfter: b.policyPenaltyAfter,
    nonRefundable: b.policyNonRefundable,
  });

  const heading =
    r.status === "confirmed"
      ? b.doneConfirmedTitle
      : r.status === "awaiting_approval"
        ? b.doneRequestTitle
        : b.doneProcessingTitle;
  const body =
    r.status === "confirmed"
      ? b.doneConfirmedBody
      : r.status === "awaiting_approval"
        ? b.doneRequestBody
        : pay
          ? b.donePayIssueBody
          : b.doneProcessingBody;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {heading}
      </h1>
      <p role="status" aria-live="polite" className="mt-2 text-slate-600 dark:text-slate-400">
        {body}
      </p>

      <section
        aria-labelledby="summary-heading"
        className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
      >
        <h2 id="summary-heading" className="sr-only">
          {b.summaryLabel}
        </h2>
        <p className="text-sm text-slate-500">{b.codeLabel}</p>
        <p className="text-2xl font-bold tracking-wide" style={{ color: "var(--brand-accent)" }}>
          {r.code}
        </p>
        <dl className="mt-4 flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt>{r.roomTypeName}</dt>
            <dd>
              {r.checkIn} → {r.checkOut}
            </dd>
          </div>
          {r.discountMinor > 0 ? (
            <div className="flex justify-between">
              <dt>
                {b.discount}
                {r.promoCode ? <span className="text-slate-500"> ({r.promoCode})</span> : null}
              </dt>
              <dd className="font-semibold">
                −{formatMoneyMinor(r.discountMinor, r.currency)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>{b.total}</dt>
            <dd className="font-semibold">{formatMoneyMinor(r.totalMinor, r.currency)}</dd>
          </div>
          {r.paymentStatus === "deposit_paid" ? (
            <div className="flex justify-between">
              <dt>{b.depositPaid}</dt>
              <dd className="font-semibold">
                {formatMoneyMinor(r.depositMinor, r.currency)}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {r.status === "pending_payment" && r.paymentStatus === "unpaid" ? (
        <form action={payNowAction} className="mt-6">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="code" value={r.code} />
          <button
            type="submit"
            className="inline-flex min-h-12 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {b.payNow}
          </button>
        </form>
      ) : null}

      {policyText ? (
        <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
          <strong>{b.policyTitle}:</strong> {policyText}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">{b.keepCode}</p>

      <Link
        href={`/${lang}`}
        className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        {dict.common.backHome}
      </Link>
    </main>
  );
}
