import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedTour } from "@/components/listing/embed-tour";
import { tourLabels } from "@/components/listing/listing-view";
import { brandCssVars, presetByKey } from "@/lib/brand-presets";
import { getDictionary } from "@/lib/dictionaries";
import { listingPageUrl } from "@/lib/listings/embed";
import { requestOrigin } from "@/lib/listings/origin";
import { getListingPage } from "@/lib/listings/queries";
import { isListingSlug } from "@/lib/listings/slug";
import { DEFAULT_LOCALE } from "@/lib/locales";
import { resolveTenant } from "@/lib/tenant";

// The embed (founding decision 4; plans/03: "the listing's tour plus a slim
// attribution bar"). Headless: no site chrome, neutral, fills whatever box the
// agent's site gives it. Public listings only, on the listing's own agency
// hosts, so the frame always carries that agency's brand.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The listing page is the indexable one; the frame is a component of other sites.
  robots: { index: false, follow: true },
};

export default async function ListingEmbed({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || !isListingSlug(slug)) notFound();
  const scene = typeof search.scene === "string" ? search.scene : null;
  const data = await getListingPage(tenant.id, slug, { requestedSceneId: scene });
  if (!data) notFound();

  const dict = await getDictionary(DEFAULT_LOCALE);
  const origin = await requestOrigin();
  const listingUrl = listingPageUrl(origin, data.listing.slug, DEFAULT_LOCALE);
  const { tour, listing, photos } = data;
  const posterUrl = tour?.scenes.find((s) => s.id === tour.startSceneId)?.thumbnail ?? photos[0]?.url;

  return (
    <div
      className="flex h-dvh flex-col bg-slate-950 text-white [color-scheme:dark]"
      style={brandCssVars(tenant.theme.presetKey)}
    >
      <div className="min-h-0 flex-1 p-0">
        {tour ? (
          <EmbedTour
            slug={listing.slug}
            tour={tour}
            listingUrl={listingUrl}
            posterUrl={posterUrl}
            pinColor={presetByKey(tenant.theme.presetKey).accent}
            labels={tourLabels(dict)}
          />
        ) : (
          <div className="relative flex h-full items-center justify-center">
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
            ) : null}
            <p className="relative rounded-lg bg-black/70 px-4 py-3 text-sm">{dict.listing.embed.noTour}</p>
          </div>
        )}
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 bg-white px-3 text-slate-900">
        <p className="min-w-0 truncate text-sm font-semibold">{listing.title}</p>
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 flex-none items-center text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {dict.listing.embed.viewFull}
          <span aria-hidden="true"> →</span>
        </a>
      </div>
    </div>
  );
}
