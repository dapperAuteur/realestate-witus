import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPartnerByToken } from "@/lib/partners";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { resolveTenant } from "@/lib/tenant";
import { partnerSelfEditAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Update your listing" };

// Partner self-edit via expiring magic link. The token only works on the
// hotel's own domain (tenant guard in getPartnerByToken) and dies on
// suspension. Editable fields only — status and category stay owner-managed.

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900";

export default async function PartnerEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const pe = dict.partnerEdit;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) notFound();

  const { ok, error } = await searchParams;
  const found = await getPartnerByToken(tenant.id, token);

  if (!found) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold [font-family:var(--font-heading)]">
          {pe.expiredTitle}
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{pe.expiredBody}</p>
      </main>
    );
  }
  const partner = found.partner;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {pe.title}
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {partner.name} · {dict.sections.partnerCategories[partner.category]}
      </p>
      <p className="mt-1 max-w-xl text-sm text-slate-500">{pe.intro}</p>

      {ok ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
        >
          {pe.savedBody}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error in dict.partnerApply.errors
            ? dict.partnerApply.errors[error as keyof typeof dict.partnerApply.errors]
            : dict.partnerApply.errors.GENERIC}
        </p>
      ) : null}

      <form action={partnerSelfEditAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="token" value={token} />
        <div className="flex flex-col gap-1">
          <label htmlFor="pe-blurb" className="text-sm font-medium">
            {dict.partnerApply.blurbField}
          </label>
          <textarea
            id="pe-blurb"
            name="blurb"
            rows={2}
            defaultValue={partner.blurb ?? ""}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pe-whatsapp" className="text-sm font-medium">
              {dict.partnerApply.whatsappField}
            </label>
            <input
              id="pe-whatsapp"
              name="whatsappE164"
              type="tel"
              defaultValue={partner.whatsappE164 ?? ""}
              className={INPUT}
            />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pe-phone" className="text-sm font-medium">
              {dict.partnerApply.phoneField}
            </label>
            <input
              id="pe-phone"
              name="phone"
              type="tel"
              defaultValue={partner.phone ?? ""}
              className={INPUT}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pe-price" className="text-sm font-medium">
              {dict.partnerApply.priceField}
            </label>
            <input
              id="pe-price"
              name="priceNote"
              defaultValue={partner.priceNote ?? ""}
              className={INPUT}
            />
          </div>
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="pe-coverage" className="text-sm font-medium">
              {dict.partnerApply.coverageField}
            </label>
            <input
              id="pe-coverage"
              name="coverageNote"
              defaultValue={partner.coverageNote ?? ""}
              className={INPUT}
            />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {pe.save}
        </button>
      </form>
    </main>
  );
}
