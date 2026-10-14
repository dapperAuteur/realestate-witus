import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

// The staff landing: who is signed in (the layout header) and the doors into
// each workspace, listings first.

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const { role, tenant } = await requireStaffPage("agent", lang);
  const isPlatform = Boolean(tenant.flags.platform);
  const a = dict.admin.overview;

  const doors = [
    { href: `/${lang}/admin/listings`, label: dict.admin.nav.listings },
    { href: `/${lang}/admin/design`, label: dict.admin.nav.design },
    ...(isPlatform
      ? []
      : [
          { href: `/${lang}/admin/team`, label: dict.admin.nav.team },
          { href: `/${lang}/admin/support`, label: dict.admin.nav.support },
        ]),
    ...(role === "owner" && !isPlatform
      ? [{ href: `/${lang}/admin/billing`, label: dict.admin.nav.billing }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-xl text-slate-600 dark:text-slate-400">{a.intro}</p>

      <section aria-labelledby="doors-heading">
        <h2 id="doors-heading" className="text-lg font-semibold">
          {a.doorsTitle}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {doors.map((door) => (
            <li key={door.href}>
              <Link
                href={door.href}
                className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
              >
                {door.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="text-lg font-semibold">
          {a.nextTitle}
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-400">
          {a.next.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
