import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnitMonth, type UnitCalendarClaim } from "@/lib/admin/blockouts";
import { requireStaffPage } from "@/lib/admin/guard";
import { addMonths, isIsoMonth, monthDays, monthOf } from "@/lib/booking/dates";
import { localToday } from "@/lib/admin/today";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { blockUnitAction, unblockUnitAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

// One row per unit, one column per day; a claim paints its nights. Free cells
// are block buttons, blockout cells are unblock buttons (progressive: plain
// forms, no JS). A date belongs to a claim when checkIn <= d < checkOut.

function claimOn(claims: UnitCalendarClaim[], date: string) {
  return claims.find((c) => c.checkIn <= date && date < c.checkOut);
}

const KIND_STYLE: Record<string, string> = {
  booking: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
  blockout:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  hold: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const KIND_LETTER: Record<string, string> = { booking: "B", blockout: "X", hold: "H" };

export default async function AdminCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ month?: string; ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const gate = { ctx: await requireStaffPage("front_desk", lang) };
  const a = dict.admin.calendar;

  const sp = await searchParams;
  const month =
    sp.month && isIsoMonth(sp.month) ? sp.month : monthOf(localToday("Africa/Accra"));
  const days = monthDays(month);
  const grid = await getUnitMonth(gate.ctx.tenant.id, month);
  if (!grid.ok) throw new Error(grid.error);
  const self = `/${lang}/admin/calendar?month=${month}`;

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/${lang}/admin/calendar?month=${addMonths(month, -1)}`}
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm dark:border-slate-700"
        >
          ← <span className="sr-only">{a.prevMonth}</span>
        </Link>
        <h2 className="text-lg font-semibold">{month}</h2>
        <Link
          href={`/${lang}/admin/calendar?month=${addMonths(month, 1)}`}
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm dark:border-slate-700"
        >
          → <span className="sr-only">{a.nextMonth}</span>
        </Link>
      </div>
      <p className="mt-2 text-xs text-slate-500">{a.legend}</p>

      {grid.data.length === 0 ? (
        <p className="mt-6 text-slate-600 dark:text-slate-400">{a.noUnits}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-white pr-2 text-left dark:bg-slate-950">
                  {a.unit}
                </th>
                {days.map((d) => (
                  <th key={d} scope="col" className="min-w-8 px-0.5 pb-1 text-center font-normal text-slate-500">
                    {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.data.map((unit) => (
                <tr key={unit.unitId}>
                  <th
                    scope="row"
                    className="sticky left-0 bg-white pr-2 text-left font-medium dark:bg-slate-950"
                  >
                    {unit.unitNumber}
                    <span className="block text-[10px] font-normal text-slate-500">
                      {unit.roomTypeName}
                    </span>
                  </th>
                  {days.map((date) => {
                    const claim = claimOn(unit.claims, date);
                    if (!claim) {
                      return (
                        <td key={date} className="p-0.5">
                          <form action={blockUnitAction}>
                            <input type="hidden" name="lang" value={lang} />
                            <input type="hidden" name="back" value={self} />
                            <input type="hidden" name="unitId" value={unit.unitId} />
                            <input type="hidden" name="date" value={date} />
                            <button
                              type="submit"
                              aria-label={`${a.block} ${unit.unitNumber} ${date}`}
                              className="block h-11 w-8 rounded border border-slate-200 hover:bg-slate-100 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current dark:border-slate-800 dark:hover:bg-slate-900"
                            />
                          </form>
                        </td>
                      );
                    }
                    if (claim.kind === "blockout") {
                      return (
                        <td key={date} className="p-0.5">
                          <form action={unblockUnitAction}>
                            <input type="hidden" name="lang" value={lang} />
                            <input type="hidden" name="back" value={self} />
                            <input type="hidden" name="claimId" value={claim.claimId} />
                            <button
                              type="submit"
                              aria-label={`${a.unblock} ${unit.unitNumber} ${date}${claim.reason ? ` (${claim.reason})` : ""}`}
                              title={claim.reason ?? undefined}
                              className={`block h-11 w-8 rounded text-center font-semibold leading-[2.75rem] ${KIND_STYLE.blockout} focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current`}
                            >
                              {KIND_LETTER.blockout}
                            </button>
                          </form>
                        </td>
                      );
                    }
                    return (
                      <td key={date} className="p-0.5">
                        <span
                          title={
                            claim.reservationCode
                              ? `${claim.reservationCode} ${claim.guestName ?? ""}`.trim()
                              : undefined
                          }
                          className={`block h-11 w-8 rounded text-center font-semibold leading-[2.75rem] ${KIND_STYLE[claim.kind]}`}
                        >
                          {KIND_LETTER[claim.kind]}
                          <span className="sr-only">
                            {claim.kind} {unit.unitNumber} {date}{" "}
                            {claim.reservationCode ?? ""}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
