import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingForm } from "@/components/admin/listing-form";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { createListingAction } from "../actions";
import { Flash } from "../../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  await requireStaffPage("manager", lang);
  const sp = await searchParams;
  const l = dict.admin.listings;
  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <h2 className="mb-6 text-xl font-semibold">{l.new}</h2>
      <ListingForm action={createListingAction} dict={dict} lang={lang} submitLabel={l.form.create} />
    </div>
  );
}
