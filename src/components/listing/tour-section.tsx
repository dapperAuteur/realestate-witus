"use client";

import { useEffect, useRef } from "react";
import { ListingTour, type ListingTourLabels } from "@/components/tour/listing-tour";
import type { VirtualTour } from "@/components/tour/types";
import { useListing } from "./listing-provider";
import { sendListingView } from "./view-beacon";

/** The tour high on the page (plans/08 6.1 item 4), wired to the rest of it. */
export function TourSection({
  slug,
  tour,
  title,
  posterUrl,
  startOpen,
  labels,
}: {
  slug: string;
  tour: VirtualTour;
  title: string;
  posterUrl?: string;
  /** A shared room link (`?scene=`) opens the tour straight away. */
  startOpen: boolean;
  labels: ListingTourLabels;
}) {
  const { openInquiry, tourRequest, setTourInView } = useListing();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setTourInView(entry.isIntersecting), {
      threshold: 0.25,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setTourInView]);

  return (
    <section ref={sectionRef} id="tour" aria-labelledby="tour-title" className="scroll-mt-28">
      <h2 id="tour-title" className="mb-3 text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <ListingTour
        tour={tour}
        labels={labels}
        posterUrl={posterUrl}
        startOpen={startOpen}
        sceneUrlSync="push"
        onInquiry={(intent) => openInquiry(intent, "tour")}
        onOpen={() => sendListingView(slug, "page", "tour")}
        request={tourRequest}
      />
    </section>
  );
}
