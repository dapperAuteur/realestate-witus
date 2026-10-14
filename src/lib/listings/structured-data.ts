// schema.org markup for a listing page (plans/08 section 8). RealEstateListing
// is a schema.org type (a WebPage for a property offered for sale or rent);
// the property itself goes in `about`. A hidden address stays hidden here
// too: locality, region and country only, never the street.

import type { ListingStatus, PropertyKind } from "./format";

const PROPERTY_TYPE: Record<PropertyKind, string> = {
  single_family: "SingleFamilyResidence",
  multi_family: "Residence",
  commercial: "Place",
  campus: "Place",
  mixed: "Place",
};

const AVAILABILITY: Partial<Record<ListingStatus, string>> = {
  for_sale: "https://schema.org/InStock",
  under_offer: "https://schema.org/LimitedAvailability",
  sold: "https://schema.org/SoldOut",
};

export function listingJsonLd(input: {
  url: string;
  title: string;
  description: string | null;
  status: ListingStatus;
  kind: PropertyKind;
  priceMinor: number | null;
  currency: string;
  datePosted: Date | null;
  images: string[];
  hideAddress: boolean;
  address: {
    addressLine1: string;
    locality: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string;
  };
}): Record<string, unknown> {
  const address: Record<string, string> = { "@type": "PostalAddress", addressCountry: input.address.countryCode };
  if (input.address.locality) address.addressLocality = input.address.locality;
  if (input.address.region) address.addressRegion = input.address.region;
  if (!input.hideAddress) {
    address.streetAddress = input.address.addressLine1;
    if (input.address.postalCode) address.postalCode = input.address.postalCode;
  }
  const availability = AVAILABILITY[input.status];
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: input.title,
    url: input.url,
    ...(input.description ? { description: input.description.slice(0, 500) } : {}),
    ...(input.datePosted ? { datePosted: input.datePosted.toISOString().slice(0, 10) } : {}),
    ...(input.images.length ? { image: input.images.slice(0, 6) } : {}),
    about: { "@type": PROPERTY_TYPE[input.kind], address },
    ...(input.priceMinor !== null && availability
      ? {
          offers: {
            "@type": "Offer",
            price: Math.round(input.priceMinor / 100),
            priceCurrency: input.currency,
            availability,
          },
        }
      : {}),
  };
}

/** Safe inside <script>: JSON cannot close the tag or open a comment. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
