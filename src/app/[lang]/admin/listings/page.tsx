import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACCENT, PRIMARY_BUTTON } from "@/components/admin/listing-form";
import { StatusChip } from "@/components/listing/status-chip";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { canEditListing, listingsBoard } from "@/lib/listings/admin";
import { roleSatisfies } from "@/lib/rbac";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listings" };

// The listings board (plans/08 phase D): every listing, its tour's progress,
// and this week's numbers, so the next job is obvious at a glance.

export default async function ListingsBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("agent", lang);
  const sp = await searchParams;
  const l = dict.admin.listings;
  const rows = await listingsBoard(ctx.tenant.id);
  const canCreate = roleSatisfies(ctx.role, "manager");
  const link =
    "inline-flex min-h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

  return (
    <div className="flex flex-col gap-6">
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{l.title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{l.intro}</p>
        </div>
        {canCreate ? (
          <Link href={`/${lang}/admin/listings/new`} className={PRIMARY_BUTTON} style={ACCENT}>
            {l.new}
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 p-6 text-slate-700 dark:border-slate-800 dark:text-slate-300">{l.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const editable = canEditListing({ role: ctx.role, userId: ctx.user.id }, row);
            return (
              <li key={row.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{row.title}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {[row.addressLine1, row.locality].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <StatusChip status={row.status} label={dict.listing.status[row.status]} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-600 dark:text-slate-400">{l.columns.tour}</dt>
                    <dd>
                      {row.scenes
                        ? l.tourRooms.replace("{published}", String(row.publishedScenes)).replace("{total}", String(row.scenes))
                        : l.noTour}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-600 dark:text-slate-400">{l.columns.week}</dt>
                    <dd>{l.weekViews.replace("{views}", String(row.pageViews7d)).replace("{opens}", String(row.tourOpens7d))}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600 dark:text-slate-400">{l.columns.inquiries}</dt>
                    <dd>{row.newInquiries}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1">
                  {editable ? (
                    <>
                      <Link href={`/${lang}/admin/listings/${row.id}`} className={link}>
                        {l.editListing}
                        <span className="sr-only">: {row.title}</span>
                      </Link>
                      <Link href={`/${lang}/admin/listings/${row.id}/tour`} className={link}>
                        {l.editTour}
                        <span className="sr-only">: {row.title}</span>
                      </Link>
                    </>
                  ) : null}
                  <Link href={`/${lang}/listings/${row.slug}`} className={link}>
                    {l.viewPage}
                    <span className="sr-only">: {row.title}</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
