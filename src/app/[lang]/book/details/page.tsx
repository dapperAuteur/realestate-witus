import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancellationPolicyText } from "@/lib/booking/policy";
import { getHoldSummary } from "@/lib/booking/summaries";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import { resolveTenant } from "@/lib/tenant";
import { confirmBookingAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Guest details" };

const INPUT_CLASSES =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900";

export default async function BookDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ claim?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const b = dict.book;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) notFound();

  const { claim, error } = await searchParams;
  const holdSession = (await cookies()).get("swu_hold_session")?.value;

  const summary =
    claim && holdSession
      ? await getHoldSummary({ tenantId: tenant.id, claimId: claim, holdSession })
      : null;

  if (!summary?.ok) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{b.holdGoneTitle}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{b.holdGoneBody}</p>
        <Link
          href={`/${lang}/book`}
          className="mt-6 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {b.searchAgain}
        </Link>
      </main>
    );
  }
  const s = summary.data;
  const policyText = cancellationPolicyText(s.cancellationPolicy, {
    freeUntil: b.policyFreeUntil,
    freeAlways: b.policyFreeAlways,
    penaltyAfter: b.policyPenaltyAfter,
    nonRefundable: b.policyNonRefundable,
  });
  const errorText =
    error && error in b.errors ? b.errors[error as keyof typeof b.errors] : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {b.detailsTitle}
      </h1>

      <section
        aria-labelledby="quote-heading"
        className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
      >
        <h2 id="quote-heading" className="text-lg font-semibold">
          {s.roomTypeName}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {s.checkIn} → {s.checkOut} · {s.nightsCount} {b.nights}
        </p>
        <dl className="mt-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt>{b.total}</dt>
            <dd className="font-semibold">
              {formatMoneyMinor(s.totalMinor, s.currency)}
            </dd>
          </div>
          {s.dueNowMinor > 0 && s.dueNowMinor < s.totalMinor ? (
            <div className="flex justify-between">
              <dt>{b.dueNow}</dt>
              <dd className="font-semibold" style={{ color: "var(--brand-accent)" }}>
                {formatMoneyMinor(s.dueNowMinor, s.currency)}
              </dd>
            </div>
          ) : null}
        </dl>
        <p role="status" className="mt-3 text-xs text-slate-500">
          {b.holdNotice}
        </p>
        {policyText ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            <strong>{b.policyTitle}:</strong> {policyText}
          </p>
        ) : null}
      </section>

      {errorText ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorText}
        </p>
      ) : null}

      <form action={confirmBookingAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="claimId" value={s.claimId} />

        <div className="flex flex-col gap-1">
          <label htmlFor="guestName" className="text-sm font-medium">
            {b.nameLabel}
          </label>
          <input id="guestName" name="guestName" required autoComplete="name" className={INPUT_CLASSES} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="guestEmail" className="text-sm font-medium">
            {b.emailLabel}
          </label>
          <input id="guestEmail" name="guestEmail" type="email" required autoComplete="email" className={INPUT_CLASSES} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="guestPhone" className="text-sm font-medium">
            {b.phoneLabel}
          </label>
          <input id="guestPhone" name="guestPhone" type="tel" autoComplete="tel" className={INPUT_CLASSES} />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="adults" className="text-sm font-medium">
              {b.adultsLabel}
            </label>
            <input id="adults" name="adults" type="number" min={1} max={8} defaultValue={1} className={INPUT_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="children" className="text-sm font-medium">
              {b.childrenLabel}
            </label>
            <input id="children" name="children" type="number" min={0} max={8} defaultValue={0} className={INPUT_CLASSES} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="promoCode" className="text-sm font-medium">
            {b.promoLabel}
          </label>
          <input id="promoCode" name="promoCode" autoComplete="off" className={INPUT_CLASSES} />
        </div>
        {/* Consent copy approved by BAM 2026-07-14 (plans/09); never pre-checked. */}
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" name="marketingOptIn" value="1" className="mt-1 h-4 w-4" />
          <span>{b.optInLabel}</span>
        </label>
        <div className="flex flex-col gap-1">
          <label htmlFor="specialRequests" className="text-sm font-medium">
            {b.requestsLabel}
          </label>
          <textarea id="specialRequests" name="specialRequests" rows={3} className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900" />
        </div>

        <button
          type="submit"
          className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {s.dueNowMinor > 0 ? b.confirmAndPay : b.confirm}
        </button>
      </form>
    </main>
  );
}
