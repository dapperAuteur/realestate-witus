"use client";

import { ListingTour, type ListingTourLabels } from "@/components/tour/listing-tour";
import type { VirtualTour } from "@/components/tour/types";

/**
 * The landing hero's real tour (plans/08 6.5 item 1): one of BAM's live
 * listings behind the same tap-to-load poster as the listing page, so the
 * poster stays the hero's LCP and the viewer loads only on a tap. No view
 * counting: people browsing the product page aren't buyers of that house,
 * and their taps mustn't inflate its seller report. "Request a tour" opens
 * the listing's own form.
 */
export function LandingTour({
  tour,
  labels,
  posterUrl,
  listingUrl,
}: {
  tour: VirtualTour;
  labels: ListingTourLabels;
  posterUrl?: string;
  listingUrl: string;
}) {
  return (
    <ListingTour
      tour={tour}
      labels={labels}
      posterUrl={posterUrl}
      height="clamp(280px, 52vh, 480px)"
      roomStrip={false}
      posterPriority
      onInquiry={(intent) => {
        window.location.assign(`${listingUrl}?inquiry=${intent}#contact`);
      }}
    />
  );
}
