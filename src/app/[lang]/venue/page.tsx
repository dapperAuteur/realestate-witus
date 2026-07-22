import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { resolveTenant } from "@/lib/tenant";
import { venueInquiryAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host your event" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900";

export default async function VenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const v = dict.venue;

  const tenant = await resolveTenant().catch(() => null);
  // Venue hire rides the events flag (it is the events pipeline's sibling).
  if (!tenant || tenant.flags.platform || !tenant.flags.events) notFound();

  const { ok, error } = await searchParams;
  if (ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold [font-family:var(--font-heading)]">
          {v.sentTitle}
        </h1>
        <p role="status" className="mt-2 text-slate-600 dark:text-slate-400">
          {v.sentBody}
        </p>
      </main>
    );
  }
  const errorText =
    error && error in v.errors ? v.errors[error as keyof typeof v.errors] : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {v.title}
      </h1>
      <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-400">{v.intro}</p>

      {errorText ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorText}
        </p>
      ) : null}

      <form action={venueInquiryAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="lang" value={lang} />
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="v-name" className="text-sm font-medium">{v.nameField}</label>
            <input id="v-name" name="name" required className={INPUT} />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="v-email" className="text-sm font-medium">{v.emailField}</label>
            <input id="v-email" name="email" type="email" required className={INPUT} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="v-phone" className="text-sm font-medium">{v.phoneField}</label>
            <input id="v-phone" name="phone" type="tel" className={INPUT} />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="v-type" className="text-sm font-medium">{v.typeField}</label>
            <input id="v-type" name="eventType" className={INPUT} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="v-date" className="text-sm font-medium">{v.dateField}</label>
            <input id="v-date" name="preferredDate" type="date" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="v-alt" className="text-sm font-medium">{v.altDateField}</label>
            <input id="v-alt" name="altDate" type="date" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="v-party" className="text-sm font-medium">{v.partyField}</label>
            <input id="v-party" name="partySize" type="number" min={1} max={500} className={`${INPUT} w-28`} />
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <label htmlFor="v-budget" className="text-sm font-medium">{v.budgetField}</label>
            <input id="v-budget" name="budgetRange" className={INPUT} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="v-message" className="text-sm font-medium">{v.messageField}</label>
          <textarea
            id="v-message"
            name="message"
            rows={3}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {v.submit}
        </button>
      </form>
    </main>
  );
}
