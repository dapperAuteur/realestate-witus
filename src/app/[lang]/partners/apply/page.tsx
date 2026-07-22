import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PARTNER_CATEGORIES } from "@/lib/partners";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { resolveTenant } from "@/lib/tenant";
import { applyPartnerAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner application" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900";

export default async function PartnerApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const p = dict.partnerApply;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform || !tenant.flags.concierge) notFound();

  const { ok, error } = await searchParams;

  if (ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold [font-family:var(--font-heading)]">
          {p.sentTitle}
        </h1>
        <p role="status" className="mt-2 text-slate-600 dark:text-slate-400">
          {p.sentBody}
        </p>
      </main>
    );
  }

  const errorText =
    error && error in p.errors ? p.errors[error as keyof typeof p.errors] : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {p.title}
      </h1>
      <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-400">{p.intro}</p>

      {errorText ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorText}
        </p>
      ) : null}

      <form action={applyPartnerAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="lang" value={lang} />
        <div className="flex flex-col gap-1">
          <label htmlFor="pa-name" className="text-sm font-medium">
            {p.nameField}
          </label>
          <input id="pa-name" name="name" required className={INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pa-category" className="text-sm font-medium">
            {p.categoryField}
          </label>
          <select id="pa-category" name="category" className={INPUT}>
            {PARTNER_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {dict.sections.partnerCategories[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pa-blurb" className="text-sm font-medium">
            {p.blurbField}
          </label>
          <textarea
            id="pa-blurb"
            name="blurb"
            rows={2}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pa-whatsapp" className="text-sm font-medium">
              {p.whatsappField}
            </label>
            <input id="pa-whatsapp" name="whatsappE164" type="tel" placeholder="+233..." className={INPUT} />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pa-phone" className="text-sm font-medium">
              {p.phoneField}
            </label>
            <input id="pa-phone" name="phone" type="tel" className={INPUT} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pa-email" className="text-sm font-medium">
            {p.emailField}
          </label>
          <input id="pa-email" name="email" type="email" className={INPUT} />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pa-price" className="text-sm font-medium">
              {p.priceField}
            </label>
            <input id="pa-price" name="priceNote" className={INPUT} />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pa-coverage" className="text-sm font-medium">
              {p.coverageField}
            </label>
            <input id="pa-coverage" name="coverageNote" className={INPUT} />
          </div>
        </div>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" name="consent" value="1" required className="mt-1 h-4 w-4" />
          <span>{p.consentLabel}</span>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-12 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {p.submit}
        </button>
      </form>
    </main>
  );
}
