import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { getHotelSettings, TIMEZONES } from "@/lib/admin/settings";
import { cancellationPolicyText } from "@/lib/booking/policy";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { saveSettingsAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function AdminSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("manager", lang);
  const a = dict.admin.settings;
  const sp = await searchParams;

  const settings = await getHotelSettings(ctx.tenant.id);
  const policyPreview = cancellationPolicyText(settings?.cancellationPolicy, {
    freeUntil: dict.book.policyFreeUntil,
    freeAlways: dict.book.policyFreeAlways,
    penaltyAfter: dict.book.policyPenaltyAfter,
    nonRefundable: dict.book.policyNonRefundable,
  });

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>

      <form action={saveSettingsAction} className="mt-6 flex flex-col gap-6">
        <input type="hidden" name="lang" value={lang} />

        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <label htmlFor="st-name" className="text-sm font-medium">{a.nameField}</label>
            <input id="st-name" name="hotelName" required defaultValue={settings?.hotelName ?? ctx.tenant.name} className={INPUT} />
          </div>
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <label htmlFor="st-email" className="text-sm font-medium">{a.emailField}</label>
            <input id="st-email" name="email" type="email" defaultValue={settings?.email ?? ""} className={INPUT} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="st-address" className="text-sm font-medium">{a.addressField}</label>
          <input id="st-address" name="address" defaultValue={settings?.address ?? ""} className={INPUT} />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="st-phone" className="text-sm font-medium">{a.phoneField}</label>
            <input id="st-phone" name="phone" type="tel" defaultValue={settings?.phone ?? ""} className={INPUT} />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="st-wa" className="text-sm font-medium">{a.whatsappField}</label>
            <input id="st-wa" name="whatsappE164" type="tel" placeholder="+233..." defaultValue={settings?.whatsappE164 ?? ""} className={INPUT} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="st-group" className="text-sm font-medium">{a.groupField}</label>
          <input id="st-group" name="whatsappGroupUrl" type="url" defaultValue={settings?.whatsappGroupUrl ?? ""} className={INPUT} />
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="st-in" className="text-sm font-medium">{a.checkinField}</label>
            <input id="st-in" name="checkinTime" defaultValue={settings?.checkinTime ?? "14:00"} className={`${INPUT} w-28`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="st-out" className="text-sm font-medium">{a.checkoutField}</label>
            <input id="st-out" name="checkoutTime" defaultValue={settings?.checkoutTime ?? "11:00"} className={`${INPUT} w-28`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="st-tz" className="text-sm font-medium">{a.timezoneField}</label>
            <select id="st-tz" name="timezone" defaultValue={settings?.timezone ?? "Africa/Accra"} className={INPUT}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="st-mode" className="text-sm font-medium">{a.modeField}</label>
            <select id="st-mode" name="bookingMode" defaultValue={settings?.bookingMode ?? "instant_deposit"} className={INPUT}>
              {(["instant_deposit", "instant_full", "request"] as const).map((mode) => (
                <option key={mode} value={mode}>{a.modes[mode]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="st-dep" className="text-sm font-medium">{a.depositField}</label>
            <input id="st-dep" name="depositPercent" type="number" min={0} max={100} defaultValue={settings?.depositPercent ?? 30} className={`${INPUT} w-24`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="st-hold" className="text-sm font-medium">{a.holdField}</label>
            <input id="st-hold" name="holdMinutes" type="number" min={5} max={120} defaultValue={settings?.holdMinutes ?? 15} className={`${INPUT} w-24`} />
          </div>
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <legend className="px-1 text-sm font-semibold">{a.policyLegend}</legend>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="st-free" className="text-sm font-medium">{a.policyFreeField}</label>
              <input id="st-free" name="cancellationFreeUntilDays" type="number" min={0} max={60} defaultValue={settings?.cancellationPolicy?.freeUntilDays ?? ""} className={`${INPUT} w-28`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="st-pen" className="text-sm font-medium">{a.policyPenaltyField}</label>
              <input id="st-pen" name="cancellationPenaltyPercent" type="number" min={0} max={100} defaultValue={settings?.cancellationPolicy?.penaltyPercent ?? ""} className={`${INPUT} w-28`} />
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {a.policyPreview}{" "}
            {policyPreview ? <em>{policyPreview}</em> : <span className="text-slate-500">{a.policyNone}</span>}
          </p>
        </fieldset>

        <button
          type="submit"
          className="inline-flex min-h-12 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {a.save}
        </button>
      </form>
    </div>
  );
}
