import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { getPricingMonth, listRoomTypes } from "@/lib/admin/pricing";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { localToday } from "@/lib/admin/today";
import { addMonths, isIsoMonth, monthOf } from "@/lib/booking/dates";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import {
  createOverrideAction,
  createPromoAction,
  deleteOverrideAction,
  togglePromoAction,
} from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function AdminPricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    roomType?: string;
    month?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const gate = { ctx: await requireStaffPage("manager", lang) };
  const a = dict.admin.pricing;

  const sp = await searchParams;
  const month =
    sp.month && isIsoMonth(sp.month) ? sp.month : monthOf(localToday("Africa/Accra"));
  const roomTypesList = await listRoomTypes(gate.ctx.tenant.id);
  const roomTypeId =
    roomTypesList.find((rt) => rt.id === sp.roomType)?.id ?? roomTypesList[0]?.id;

  const pricing = roomTypeId
    ? await getPricingMonth(gate.ctx.tenant.id, roomTypeId, month)
    : null;
  const promos = await db()
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.tenantId, gate.ctx.tenant.id))
    .orderBy(asc(promoCodes.code))
    .catch(() => []);
  const self = `/${lang}/admin/pricing?roomType=${roomTypeId ?? ""}&month=${month}`;

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="roomType" className="text-sm font-medium">
            {a.roomTypeLabel}
          </label>
          <select id="roomType" name="roomType" defaultValue={roomTypeId} className={INPUT}>
            {roomTypesList.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium dark:border-slate-700"
        >
          {a.show}
        </button>
        <span className="ml-auto flex items-center gap-2">
          <Link
            href={`/${lang}/admin/pricing?roomType=${roomTypeId ?? ""}&month=${addMonths(month, -1)}`}
            className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm dark:border-slate-700"
          >
            ← <span className="sr-only">{dict.admin.calendar.prevMonth}</span>
          </Link>
          <span className="text-sm font-semibold">{month}</span>
          <Link
            href={`/${lang}/admin/pricing?roomType=${roomTypeId ?? ""}&month=${addMonths(month, 1)}`}
            className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm dark:border-slate-700"
          >
            → <span className="sr-only">{dict.admin.calendar.nextMonth}</span>
          </Link>
        </span>
      </form>

      {pricing?.ok ? (
        <>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            {a.baseRate}:{" "}
            <strong>
              {formatMoneyMinor(pricing.data.roomType.baseRateMinor, pricing.data.roomType.currency)}
            </strong>{" "}
            {a.perNight}
          </p>

          <ul className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-7">
            {pricing.data.days.map((day) => (
              <li
                key={day.date}
                className={`rounded-lg border p-2 text-center ${day.overrideLabel ? "border-slate-900 dark:border-slate-100" : "border-slate-200 dark:border-slate-800"}`}
              >
                <span className="block text-xs text-slate-500">
                  {Number(day.date.slice(8))}
                </span>
                <span className="block text-sm font-semibold">
                  {formatMoneyMinor(day.rateMinor, pricing.data.roomType.currency)}
                </span>
                {day.overrideLabel ? (
                  <span className="block truncate text-[10px]" style={{ color: "var(--brand-accent)" }}>
                    {day.overrideLabel}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <section aria-label={a.overrides} className="mt-8">
            <h2 className="text-lg font-semibold">{a.overrides}</h2>
            {pricing.data.overrides.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{a.noOverrides}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {pricing.data.overrides.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                  >
                    <span>
                      <strong>{o.label}</strong> · {o.startDate} → {o.endDate} ·{" "}
                      {formatMoneyMinor(o.rateMinor, pricing.data.roomType.currency)} ·{" "}
                      {dict.admin.pricing.priorityField.split(" ")[0]} {o.priority}
                    </span>
                    <form action={deleteOverrideAction}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="back" value={self} />
                      <input type="hidden" name="overrideId" value={o.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 font-medium dark:border-slate-700"
                      >
                        {a.delete}
                        <span className="sr-only">
                          {" "}
                          {a.deleteConfirm}: {o.label}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={a.addOverride} className="mt-8 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-lg font-semibold">{a.addOverride}</h2>
            <form action={createOverrideAction} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="back" value={self} />
              <input type="hidden" name="roomTypeId" value={pricing.data.roomType.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="ov-label" className="text-sm font-medium">
                  {a.labelField}
                </label>
                <input id="ov-label" name="label" required className={INPUT} />
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="ov-start" className="text-sm font-medium">
                    {a.start}
                  </label>
                  <input id="ov-start" name="startDate" type="date" required className={INPUT} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="ov-end" className="text-sm font-medium">
                    {a.end}
                  </label>
                  <input id="ov-end" name="endDate" type="date" required className={INPUT} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="ov-rate" className="text-sm font-medium">
                    {a.rateField}
                  </label>
                  <input id="ov-rate" name="rateMinor" type="number" min={1} step={1} required className={INPUT} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="ov-priority" className="text-sm font-medium">
                    {a.priorityField}
                  </label>
                  <input id="ov-priority" name="priority" type="number" defaultValue={0} step={1} className={INPUT} />
                </div>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">{a.daysField}</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {a.dows.map((label, bit) => (
                    <label key={label} className="inline-flex min-h-11 items-center gap-1.5 text-sm">
                      <input type="checkbox" name={`dow${bit}`} value="1" className="h-4 w-4" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                type="submit"
                className="inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
              >
                {a.create}
              </button>
            </form>
          </section>

          <section aria-label={a.promoTitle} className="mt-8 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-lg font-semibold">{a.promoTitle}</h2>
            <p className="mt-1 max-w-xl text-xs text-slate-500">{a.promoIntro}</p>
            {promos.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {promos.map((promo) => (
                  <li key={promo.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <span>
                      <strong className="font-mono">{promo.code}</strong> ·{" "}
                      {promo.kind === "percent"
                        ? `${promo.value}%`
                        : formatMoneyMinor(promo.value, pricing.data.roomType.currency)}{" "}
                      · {promo.redemptionCount}
                      {promo.maxRedemptions ? `/${promo.maxRedemptions}` : ""} {a.promoUsed}
                      {!promo.isActive ? " · off" : ""}
                    </span>
                    <form action={togglePromoAction}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="back" value={self} />
                      <input type="hidden" name="promoId" value={promo.id} />
                      <input type="hidden" name="active" value={promo.isActive ? "0" : "1"} />
                      <button type="submit" className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 font-medium dark:border-slate-700">
                        {promo.isActive ? a.promoDeactivate : a.promoActivate}
                        <span className="sr-only"> {promo.code}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">{a.promoEmpty}</p>
            )}
            <form action={createPromoAction} className="mt-4 flex flex-wrap items-end gap-4">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="back" value={self} />
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-code" className="text-sm font-medium">{a.promoCodeField}</label>
                <input id="promo-code" name="code" required className={INPUT} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-kind" className="text-sm font-medium">{a.promoKindField}</label>
                <select id="promo-kind" name="kind" className={INPUT}>
                  <option value="percent">{a.promoPercent}</option>
                  <option value="fixed">{a.promoFixed}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-value" className="text-sm font-medium">{a.promoValueField}</label>
                <input id="promo-value" name="value" type="number" min={1} required className={`${INPUT} w-28`} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-room" className="text-sm font-medium">{a.promoRoomField}</label>
                <select id="promo-room" name="roomTypeId" className={INPUT}>
                  <option value="">{a.promoAnyRoom}</option>
                  {roomTypesList.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-starts" className="text-sm font-medium">{a.promoStartsField}</label>
                <input id="promo-starts" name="startsOn" type="date" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-ends" className="text-sm font-medium">{a.promoEndsField}</label>
                <input id="promo-ends" name="endsOn" type="date" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promo-max" className="text-sm font-medium">{a.promoMaxField}</label>
                <input id="promo-max" name="maxRedemptions" type="number" min={1} className={`${INPUT} w-28`} />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
              >
                {a.promoCreate}
              </button>
            </form>
          </section>
        </>
      ) : (
        <p className="mt-6 text-slate-600 dark:text-slate-400">
          {dict.admin.calendar.noUnits}
        </p>
      )}
    </div>
  );
}
