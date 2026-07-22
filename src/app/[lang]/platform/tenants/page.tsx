import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { requirePlatformPage } from "@/lib/platform/guard";
import { EDITABLE_FLAGS, listTenantsAdmin } from "@/lib/platform/tenants";
import { createTenantAction, updateTenantAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Properties" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function PlatformTenantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await requirePlatformPage();
  const dict = await getDictionary(lang);
  const d = dict.platform.tenantsPage;
  const sp = await searchParams;
  const rows = await listTenantsAdmin();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}/platform`} className="underline underline-offset-4">
          {dict.platform.title}
        </Link>{" "}
        / {d.title}
      </p>
      <h1 className="mt-2 text-2xl font-bold">{d.title}</h1>

      {sp.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {sp.error in d.errors ? d.errors[sp.error as keyof typeof d.errors] : d.errors.GENERIC}
        </p>
      ) : sp.ok ? (
        <p role="status" className="mt-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          {dict.platform.domains.saved}
        </p>
      ) : null}

      <section aria-label={d.createTitle} className="mt-6 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
        <h2 className="text-lg font-semibold">{d.createTitle}</h2>
        <form action={createTenantAction} className="mt-4 flex flex-wrap items-end gap-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="nt-slug" className="text-sm font-medium">{d.slugField}</label>
            <input id="nt-slug" name="slug" required className={INPUT} />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="nt-name" className="text-sm font-medium">{d.nameField}</label>
            <input id="nt-name" name="name" required className={INPUT} />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {d.create}
          </button>
        </form>
      </section>

      <ul className="mt-8 flex flex-col gap-6">
        {rows.map((tenant) => (
          <li key={tenant.id} className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {tenant.name}{" "}
                <code className="text-xs font-normal text-slate-500">{tenant.slug}</code>
              </h2>
              <p className="text-xs text-slate-500">
                {tenant.domainCount} {d.domains} ·{" "}
                <Link
                  href={`/${lang}/platform/billing?tenant=${tenant.id}`}
                  className="underline underline-offset-4"
                >
                  {d.billingLink}
                </Link>
              </p>
            </div>
            {tenant.flags.platform ? null : (
              <form action={updateTenantAction} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="tenantId" value={tenant.id} />
                <div className="flex flex-wrap gap-4">
                  <div className="flex min-w-48 flex-1 flex-col gap-1">
                    <label htmlFor={`${tenant.id}-name`} className="text-sm font-medium">{d.nameField}</label>
                    <input id={`${tenant.id}-name`} name="name" required defaultValue={tenant.name} className={INPUT} />
                  </div>
                  <div className="flex min-w-48 flex-1 flex-col gap-1">
                    <label htmlFor={`${tenant.id}-tag`} className="text-sm font-medium">{d.taglineField}</label>
                    <input id={`${tenant.id}-tag`} name="tagline" defaultValue={tenant.tagline ?? ""} className={INPUT} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name="isActive" value="1" defaultChecked={tenant.isActive} className="h-4 w-4" />
                    {d.activeField}
                  </label>
                  {EDITABLE_FLAGS.map((flag) => (
                    <label key={flag} className="inline-flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`flag_${flag}`}
                        value="1"
                        defaultChecked={Boolean(tenant.flags[flag])}
                        className="h-4 w-4"
                      />
                      {d.flagLabels[flag]}
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-fit items-center rounded-full border border-slate-300 px-6 text-sm font-semibold dark:border-slate-700"
                >
                  {d.editSave}
                  <span className="sr-only"> {tenant.name}</span>
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
