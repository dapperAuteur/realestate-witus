import Link from "next/link";
import type en from "@/dictionaries/en.json";
import type { displayAddress } from "@/lib/listings/format";
import { REPORT_RANGES, type ReportRange, type SellerReport } from "@/lib/listings/seller-report";
import { HINT, SECONDARY_BUTTON } from "./listing-form";
import { PrintButton } from "./print-button";

// The seller report's page body (plans/08 6.5): the page loads, this lays out,
// on screen and on paper. Counts only: nobody who looked is named, and
// inquiries are counted, never quoted.

export type SellerReportLabels = (typeof en)["admin"]["listings"]["report"];

export function SellerReportView({
  lang,
  labels: r,
  listingTitle,
  address,
  agency,
  range,
  days,
  report,
  backHref,
  today,
}: {
  lang: string;
  labels: SellerReportLabels;
  listingTitle: string;
  address: ReturnType<typeof displayAddress> | null;
  agency: string;
  range: ReportRange;
  /** The report's dates, oldest first (reportDays). */
  days: string[];
  report: SellerReport;
  /** The listing's admin page; the report lives at `${backHref}/report`. */
  backHref: string;
  today: Date;
}) {
  const number = new Intl.NumberFormat(lang);
  const shortDate = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat(lang, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const fill = (text: string, values: Record<string, string | number>) =>
    text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
  const from = longDate.format(asDate(days[0]));
  const to = longDate.format(asDate(days[days.length - 1]));
  const peak = Math.max(1, ...report.days.map((d) => d.views));
  const back = backHref;
  const chartAlt = report.busiest
    ? fill(r.chartAlt, { from, to, busiest: fill(r.busiest, { day: longDate.format(asDate(report.busiest.day)), n: number.format(report.busiest.views) }) })
    : fill(r.chartAltQuiet, { from, to });
  const tile = "rounded-lg bg-slate-100 p-4 dark:bg-slate-900 print:border print:border-slate-300 print:bg-white";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <nav aria-label={r.rangeLabel}>
          <ul className="flex flex-wrap gap-2">
            {REPORT_RANGES.map((n) => (
              <li key={n}>
                <Link
                  href={`${back}/report?days=${n}`}
                  aria-current={n === range ? "page" : undefined}
                  className={`${SECONDARY_BUTTON} ${n === range ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900" : ""}`}
                >
                  {fill(r.range, { n })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap gap-2">
          <PrintButton label={r.print} />
          <Link href={back} className={SECONDARY_BUTTON}>
            {r.back}
          </Link>
        </div>
      </div>

      <header>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{fill(r.prepared, { date: longDate.format(today), agency })}</p>
        <h2 className="mt-1 text-2xl font-bold">
          {r.title}: {listingTitle}
        </h2>
        {address ? (
          <p className="mt-1">
            {address.primary}
            {address.secondary ? <span className="text-slate-600 dark:text-slate-400"> · {address.secondary}</span> : null}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {fill(r.range, { n: range })}: {fill(r.period, { from, to })}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={tile}>
          <dt className="text-sm text-slate-600 dark:text-slate-400">{r.views}</dt>
          <dd className="text-3xl font-bold">{number.format(report.totals.views)}</dd>
        </div>
        <div className={tile}>
          <dt className="text-sm text-slate-600 dark:text-slate-400">{r.opens}</dt>
          <dd className="text-3xl font-bold">{number.format(report.totals.opens)}</dd>
        </div>
        <div className={tile}>
          <dt className="text-sm text-slate-600 dark:text-slate-400">{r.openRate}</dt>
          <dd className="text-3xl font-bold">
            {report.openRate === null ? (
              <span className="text-base font-medium">{r.noRate}</span>
            ) : (
              <>
                {Math.round(report.openRate * 100)}%
                <span className="block text-sm font-normal text-slate-600 dark:text-slate-400">{r.openRateHint}</span>
              </>
            )}
          </dd>
        </div>
        <div className={tile}>
          <dt className="text-sm text-slate-600 dark:text-slate-400">{r.inquiries}</dt>
          <dd className="text-3xl font-bold">
            {number.format(report.totals.inquiries)}
            <span className="block text-sm font-normal text-slate-600 dark:text-slate-400">
              {fill(r.tourRequests, { n: number.format(report.totals.tourRequests) })}
            </span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="report-where">
        <h3 id="report-where" className="text-lg font-semibold">
          {r.whereTitle}
        </h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {([
            [r.page, report.totals.page],
            [r.embed, report.totals.embed],
          ] as const).map(([label, numbers]) => (
            <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
              <dd className="font-semibold">
                {fill(r.whereLine, { views: number.format(numbers.views), opens: number.format(numbers.opens) })}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="report-daily">
        <h3 id="report-daily" className="text-lg font-semibold">
          {r.dailyTitle}
        </h3>
        {report.totals.views === 0 ? <p className="mt-2 text-sm">{r.empty}</p> : null}
        <ul className="mt-2 flex gap-4 text-xs text-slate-700 dark:text-slate-300" aria-hidden="true">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-slate-400 dark:bg-slate-500" />
            {r.legendViews}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--brand-accent)" }} />
            {r.legendOpens}
          </li>
        </ul>
        <div role="img" aria-label={chartAlt} className="mt-2 flex h-40 items-end gap-px border-b border-slate-300 dark:border-slate-700">
          {report.days.map((day) => (
            <div key={day.day} className="relative flex h-full flex-1 items-end">
              <div className="w-full rounded-t-sm bg-slate-400 dark:bg-slate-500" style={{ height: `${(day.views / peak) * 100}%` }} />
              <div
                className="absolute bottom-0 left-1/4 w-1/2 rounded-t-sm"
                style={{ height: `${Math.min(100, (day.opens / peak) * 100)}%`, background: "var(--brand-accent)" }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-600 dark:text-slate-400" aria-hidden="true">
          <span>{shortDate.format(asDate(days[0]))}</span>
          <span>{shortDate.format(asDate(days[days.length - 1]))}</span>
        </div>
        {report.busiest ? (
          <p className="mt-2 text-sm">
            {fill(r.busiest, { day: longDate.format(asDate(report.busiest.day)), n: number.format(report.busiest.views) })}
          </p>
        ) : null}
        <details className="mt-3 print:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{r.tableSummary}</summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  {r.day}
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  {r.views}
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  {r.opens}
                </th>
                <th scope="col" className="py-1 font-semibold">
                  {r.inquiries}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...report.days].reverse().map((day) => (
                <tr key={day.day} className="border-b border-slate-100 dark:border-slate-900">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {longDate.format(asDate(day.day))}
                  </th>
                  <td className="py-1 pr-3">{number.format(day.views)}</td>
                  <td className="py-1 pr-3">{number.format(day.opens)}</td>
                  <td className="py-1">{number.format(day.inquiries)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <p className={`${HINT} max-w-2xl`}>{r.privacy}</p>
    </div>
  );
}
