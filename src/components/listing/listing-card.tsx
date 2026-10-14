import type { Dictionary } from "@/lib/dictionaries";
import { displayAddress, factStrip, formatPrice } from "@/lib/listings/format";
import type { ListingCard as ListingCardData } from "@/lib/listings/queries";
import { StatusChip } from "./status-chip";

/**
 * A listing in a grid (design lock: image with a "360" badge, then price,
 * then facts, then address). The whole card is one link; the badge and the
 * status chip carry words, never color alone.
 */
export function ListingCard({ listing, dict, lang }: { listing: ListingCardData; dict: Dictionary; lang: string }) {
  const d = dict.listing;
  const address = displayAddress(listing.property, listing.hideAddress);
  const price = formatPrice(listing.priceMinor, listing.currency, lang) ?? d.priceOnRequest;
  const cells = factStrip({
    kind: listing.property.kind,
    facts: listing.facts,
    priceMinor: null,
    currency: listing.currency,
    locale: lang,
  });
  const factsLine = cells
    .map((cell) =>
      cell.key === "area"
        ? `${cell.value} ${d.units[cell.unit ?? "sqft"]}`
        : cell.key === "pricePerArea"
          ? null
          : `${cell.value} ${d.facts[cell.key]}`,
    )
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <a
        href={`/${lang}/listings/${listing.slug}`}
        className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        <div className="relative aspect-[4/3] bg-slate-100">
          {listing.heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.heroUrl} alt={listing.heroAlt} loading="lazy" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <StatusChip status={listing.status} label={d.status[listing.status]} />
            {listing.hasTour ? (
              <span
                className="inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold"
                style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
              >
                {dict.home.tourBadge}
              </span>
            ) : null}
          </div>
        </div>
        <div className="space-y-1 p-4">
          <p className="text-2xl font-bold text-slate-900">{price}</p>
          {factsLine ? <p className="text-sm text-slate-700">{factsLine}</p> : null}
          <h3 className="truncate font-semibold text-slate-900">{address.primary || listing.title}</h3>
          <p className="truncate text-sm text-slate-600">{listing.title}</p>
        </div>
      </a>
    </article>
  );
}
