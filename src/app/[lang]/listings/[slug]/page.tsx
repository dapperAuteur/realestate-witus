import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ListingView } from "@/components/listing/listing-view";
import { getStaffContext } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { listingPageUrl } from "@/lib/listings/embed";
import { displayAddress, isPublicStatus, type ListingStatus, type PropertyKind } from "@/lib/listings/format";
import { requestOrigin } from "@/lib/listings/origin";
import { getListingPage } from "@/lib/listings/queries";
import { isListingSlug } from "@/lib/listings/slug";
import { listingJsonLd, serializeJsonLd } from "@/lib/listings/structured-data";
import { resolveTenant } from "@/lib/tenant";

// The public listing page (plans/08 phase C). Resolved on the request's host:
// a listing only renders on its own agency's domains. Staff signed in to that
// agency also see drafts, with a preview notice and noindex.

export const dynamic = "force-dynamic";

type Params = Promise<{ lang: string; slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const load = cache(async (slug: string, scene: string | null) => {
  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || !isListingSlug(slug)) return null;
  const gate = await getStaffContext("agent").catch(() => null);
  const staffPreview = Boolean(gate?.ok && gate.ctx.tenant.id === tenant.id);
  const data = await getListingPage(tenant.id, slug, { staffPreview, requestedSceneId: scene });
  return data ? { tenant, data } : null;
});

function sceneParam(search: Record<string, string | string[] | undefined>): string | null {
  return typeof search.scene === "string" ? search.scene : null;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const found = await load(slug, sceneParam(await searchParams));
  if (!found) return {};
  const { listing, property, photos } = found.data;
  const address = displayAddress(property, listing.hideAddress);
  const description = [address.primary, listing.highlights.join(". ")].filter(Boolean).join(". ").slice(0, 200);
  const url = listingPageUrl(await requestOrigin(), listing.slug, lang);
  const hero = photos[0];
  return {
    title: listing.title,
    description,
    // The slashless form is canonical (next.config.ts: skipTrailingSlashRedirect).
    alternates: { canonical: url },
    robots: isPublicStatus(listing.status as ListingStatus) ? undefined : { index: false, follow: false },
    openGraph: {
      title: listing.title,
      description,
      url,
      type: "website",
      ...(hero ? { images: [{ url: hero.url, alt: hero.alt }] } : {}),
    },
  };
}

export default async function ListingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const search = await searchParams;
  const scene = sceneParam(search);
  const inquiry = typeof search.inquiry === "string" ? search.inquiry : null;
  const found = await load(slug, scene);
  if (!found) notFound();
  const { tenant, data } = found;
  const dict = await getDictionary(lang);
  const preview = !isPublicStatus(data.listing.status as ListingStatus);
  const origin = await requestOrigin();
  const jsonLd = listingJsonLd({
    url: listingPageUrl(origin, data.listing.slug, lang),
    title: data.listing.title,
    description: data.listing.description,
    status: data.listing.status as ListingStatus,
    kind: data.property.kind as PropertyKind,
    priceMinor: data.listing.priceMinor,
    currency: data.listing.currency,
    datePosted: data.listing.publishedAt,
    images: data.photos.map((photo) => photo.url),
    hideAddress: data.listing.hideAddress,
    address: data.property,
  });

  return (
    <>
      {preview ? null : (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      )}
      <ListingView
        data={data}
        tenant={tenant}
        dict={dict}
        lang={lang}
        startTourOpen={Boolean(scene && data.tour?.scenes.some((s) => s.id === scene))}
        preview={preview}
        initialInquiry={inquiry === "tour_request" || inquiry === "question" ? inquiry : null}
      />
    </>
  );
}
