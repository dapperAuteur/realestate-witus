import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";

export const dynamic = "force-dynamic";

// Staff chrome. The guard runs here for UX (redirect vs 404) — every server
// action and page still re-checks on its own; the layout is not the security
// boundary.

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const { tenant, user, role } = await requireStaffPage("front_desk", lang);
  const a = dict.admin;

  const tabs = [
    { href: `/${lang}/admin`, label: a.nav.today },
    { href: `/${lang}/admin/reservations`, label: a.nav.reservations },
    { href: `/${lang}/admin/calendar`, label: a.nav.calendar },
    { href: `/${lang}/admin/rooms`, label: a.nav.rooms },
    { href: `/${lang}/admin/pricing`, label: a.nav.pricing },
    { href: `/${lang}/admin/events`, label: a.nav.events },
    { href: `/${lang}/admin/announce`, label: a.nav.announce },
    { href: `/${lang}/admin/partners`, label: a.nav.partners },
    { href: `/${lang}/admin/content`, label: a.nav.content },
    { href: `/${lang}/admin/guide`, label: a.nav.guide },
    { href: `/${lang}/admin/design`, label: a.nav.design },
    { href: `/${lang}/admin/team`, label: a.nav.team },
    { href: `/${lang}/admin/support`, label: a.nav.support },
    { href: `/${lang}/admin/settings`, label: a.nav.settings },
    // Platform invoices are the owner's business only.
    ...(role === "owner"
      ? [{ href: `/${lang}/admin/billing`, label: a.nav.billing }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {tenant.theme.name ?? tenant.name}{" "}
          <span className="text-base font-normal text-slate-500">{a.title}</span>
        </h1>
        <p className="text-xs text-slate-500">
          {a.roleLabel} {user.email} ({role})
        </p>
      </header>
      <nav aria-label={a.title} className="mt-4 overflow-x-auto">
        <ul className="flex gap-2 text-sm">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mt-6">{children}</main>
    </div>
  );
}
