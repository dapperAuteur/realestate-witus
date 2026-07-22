import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import {
  listReservations,
  RESERVATION_STATUSES,
  type ReservationAction,
  type ReservationRow,
  type ReservationStatus,
} from "@/lib/admin/reservations";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import { reservationAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reservations" };

/** Which desk buttons make sense per current status. */
const ROW_ACTIONS: Partial<Record<ReservationStatus, ReservationAction[]>> = {
  awaiting_approval: ["approve", "cancel"],
  pending_payment: ["check_in", "cancel", "no_show"],
  confirmed: ["check_in", "cancel", "no_show"],
  checked_in: ["check_out"],
};

export default async function AdminReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const gate = { ctx: await requireStaffPage("front_desk", lang) };
  const a = dict.admin;

  const { status, ok, error } = await searchParams;
  const filter = RESERVATION_STATUSES.includes(status as ReservationStatus)
    ? (status as ReservationStatus)
    : undefined;
  const result = await listReservations(gate.ctx.tenant.id, { status: filter });
  if (!result.ok) throw new Error(result.error);

  const self = `/${lang}/admin/reservations${filter ? `?status=${filter}` : ""}`;

  return (
    <div>
      <Flash ok={ok} error={error} dict={dict} />

      <nav aria-label={a.reservations.filterLabel} className="overflow-x-auto">
        <ul className="flex gap-2 text-xs">
          <li>
            <Link
              href={`/${lang}/admin/reservations`}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 ${!filter ? "border-slate-900 font-semibold dark:border-slate-100" : "border-slate-300 dark:border-slate-700"}`}
            >
              {a.reservations.all}
            </Link>
          </li>
          {RESERVATION_STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={`/${lang}/admin/reservations?status=${s}`}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 ${filter === s ? "border-slate-900 font-semibold dark:border-slate-100" : "border-slate-300 dark:border-slate-700"}`}
              >
                {s.replace("_", " ")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {result.data.length === 0 ? (
        <p className="mt-6 text-slate-600 dark:text-slate-400">
          {a.reservations.empty}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {result.data.map((r: ReservationRow) => (
            <li
              key={r.id}
              className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {r.guestName}{" "}
                  <span className="font-mono text-xs text-slate-500">{r.code}</span>
                </p>
                <p className="text-sm">
                  <span className="font-medium">{r.status.replace("_", " ")}</span>{" "}
                  <span className="text-slate-500">
                    · {r.paymentStatus.replace("_", " ")}
                  </span>
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {r.roomTypeName} · {r.checkIn} → {r.checkOut} ·{" "}
                {formatMoneyMinor(r.totalMinor, r.currency)}
              </p>
              {ROW_ACTIONS[r.status]?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {ROW_ACTIONS[r.status]?.map((action) => (
                    <form key={action} action={reservationAction}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="back" value={self} />
                      <input type="hidden" name="reservationId" value={r.id} />
                      <input type="hidden" name="action" value={action} />
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
                      >
                        {a.reservations.actions[action]}
                        <span className="sr-only">
                          {" "}
                          {r.code} ({r.guestName})
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
