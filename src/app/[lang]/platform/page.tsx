import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { hasDatabase } from "@/lib/env";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { requirePlatformPage } from "@/lib/platform/guard";
import { getGlobalSetting, PROMO_BANNER_KEY } from "@/lib/platform/settings";
import { savePromoBannerAction } from "./actions";

export const dynamic = "force-dynamic";

// BAM's platform dashboard skeleton: tenants, per-tenant flags/pricing,
// billing (invoices + MoMo confirmation), cross-tenant support inbox, logs.
// GUARD: platform owners only. PLATFORM_BOOTSTRAP keeps a temporary window
// open ONLY while no platform owner exists yet (first sign-in, then BAM's
// user gets is_platform_owner=true — user-task 09); it closes itself after.

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  await requirePlatformPage();
  const dict = await getDictionary(lang);
  const promoBanner = hasDatabase
    ? await getGlobalSetting(PROMO_BANNER_KEY).catch(() => null)
    : null;

  const rows = hasDatabase
    ? await db()
        .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .catch(() => [])
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{dict.platform.title}</h1>

      <nav aria-label="Platform sections" className="mt-4">
        <ul className="flex flex-wrap gap-2 text-sm">
          <li>
            <Link
              href={`/${lang}/platform/tenants`}
              className="inline-flex rounded-full border border-slate-900 px-3 py-1.5 font-semibold underline-offset-4 hover:underline dark:border-slate-100"
            >
              {dict.platform.tenants}
            </Link>
          </li>
          <li>
            <Link
              href={`/${lang}/platform/domains`}
              className="inline-flex rounded-full border border-slate-900 px-3 py-1.5 font-semibold underline-offset-4 hover:underline dark:border-slate-100"
            >
              {dict.platform.domains.title}
            </Link>
          </li>
          <li>
            <Link
              href={`/${lang}/platform/billing`}
              className="inline-flex rounded-full border border-slate-900 px-3 py-1.5 font-semibold underline-offset-4 hover:underline dark:border-slate-100"
            >
              {dict.platform.billing}
            </Link>
          </li>
          <li>
            <Link
              href={`/${lang}/platform/support`}
              className="inline-flex rounded-full border border-slate-900 px-3 py-1.5 font-semibold underline-offset-4 hover:underline dark:border-slate-100"
            >
              {dict.platform.support}
            </Link>
          </li>
          <li>
            <Link
              href={`/${lang}/platform/logs`}
              className="inline-flex rounded-full border border-slate-900 px-3 py-1.5 font-semibold underline-offset-4 hover:underline dark:border-slate-100"
            >
              {dict.platform.logs}
            </Link>
          </li>
        </ul>
      </nav>

      <section aria-labelledby="banner-heading" className="mt-8 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 id="banner-heading" className="text-lg font-semibold">
          {dict.platform.bannerTitle}
        </h2>
        <p className="mt-1 max-w-xl text-xs text-slate-500">{dict.platform.bannerHint}</p>
        <form action={savePromoBannerAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="lang" value={lang} />
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <label htmlFor="bannerText" className="text-sm font-medium">
              {dict.platform.bannerField}
            </label>
            <input
              id="bannerText"
              name="bannerText"
              defaultValue={promoBanner ?? ""}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-semibold dark:border-slate-700"
          >
            {dict.platform.bannerSave}
          </button>
        </form>
      </section>

      <section aria-labelledby="tenants-heading" className="mt-8">
        <h2 id="tenants-heading" className="text-lg font-semibold">
          {dict.platform.tenants}
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            No properties yet. Seeding and tenant CRUD land with the platform-admin
            workstream.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span>{t.name}</span>
                <code className="text-xs text-slate-500">{t.slug}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
