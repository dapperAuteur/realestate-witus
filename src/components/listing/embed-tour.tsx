"use client";

import { ListingTour, type ListingTourLabels } from "@/components/tour/listing-tour";
import type { VirtualTour } from "@/components/tour/types";
import { sendListingView, ViewBeacon } from "./view-beacon";

/**
 * The tour inside an agent's own site. Fills the iframe; `?scene=` is kept
 * with replaceState (an iframe shares the parent's history, so pushing would
 * hijack the partner's Back button). A pinned "Request a tour" opens the full
 * listing in a new tab at the form: the buyer stays on the agent's page.
 */
export function EmbedTour({
  slug,
  tour,
  listingUrl,
  posterUrl,
  pinColor,
  labels,
}: {
  slug: string;
  tour: VirtualTour;
  listingUrl: string;
  posterUrl?: string;
  pinColor?: string;
  labels: ListingTourLabels;
}) {
  return (
    <>
      <ListingTour
        tour={tour}
        labels={labels}
        posterUrl={posterUrl}
        height="100%"
        roomStrip={false}
        pinColor={pinColor}
        sceneUrlSync="replace"
        onInquiry={(intent) => {
          window.open(`${listingUrl}?inquiry=${intent}#contact`, "_blank", "noopener,noreferrer");
        }}
        onOpen={() => sendListingView(slug, "embed", "tour")}
      />
      <ViewBeacon slug={slug} surface="embed" />
    </>
  );
}
