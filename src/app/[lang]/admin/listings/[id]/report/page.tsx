import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SellerReportView } from "@/components/admin/seller-report-view";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { canEditListing, findOwnedListing, sellerReportRows } from "@/lib/listings/admin";
import { displayAddress } from "@/lib/listings/format";
import { parseReportRange, reportDays, sellerReport } from "@/lib/listings/seller-report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seller report" };

// The seller report (plans/08 6.5, "Show your seller how many buyers walked
// the tour"): one listing's views, tour opens and inquiries over 7, 30 or 90
// days, to print or save as a PDF. SellerReportView lays it out.

export default async function SellerReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("agent", lang);
  const listing = await findOwnedListing(ctx.tenant.id, id);
  if (!listing || !canEditListing({ role: ctx.role, userId: ctx.user.id }, listing)) notFound();
  const r = dict.admin.listings.report;
  const range = parseReportRange((await searchParams).days);
  const today = new Date();
  const days = reportDays(range, today);
  const rows = await sellerReportRows(ctx.tenant.id, listing, days[0]);
  const report = sellerReport(days, rows.views, rows.inquiries);

  return (
    <SellerReportView
      lang={lang}
      labels={r}
      listingTitle={listing.title}
      address={rows.property ? displayAddress(rows.property, false) : null}
      agency={ctx.tenant.theme.name ?? ctx.tenant.name}
      range={range}
      days={days}
      report={report}
      backHref={`/${lang}/admin/listings/${listing.id}`}
      today={today}
    />
  );
}
