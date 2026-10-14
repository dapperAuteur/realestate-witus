"use client";

import { useCallback, useRef, useState } from "react";
import type { InquiryIntent } from "@/lib/tour/tour-links";
import type { SceneUrlSyncMode } from "@/lib/tour/scene-url-sync";
import { RoomStrip, type RoomStripLabels } from "./room-strip";
import { Tour, type TourViewerApi, type TourViewerLabels } from "./tour";
import type { VirtualTour } from "./types";

export type ListingTourLabels = {
  viewer: TourViewerLabels;
  rooms: RoomStripLabels;
  /** The poster's button: "Explore in 360". */
  open: string;
  /** Under it: "{n} rooms". */
  roomCount: string;
};

/**
 * A listing's tour behind a tap-to-load poster (plans/08 section 6.1 item 4).
 *
 * Nothing heavy loads until the buyer asks: the poster is one responsive
 * image, and PSV plus the first panorama arrive on the tap. That keeps the
 * listing page's LCP on the photo and spares a 3G visitor megabytes they did
 * not choose to spend. A shared room link (`?scene=`) opens straight away,
 * because the person who sent it already chose the tour for them.
 */
export function ListingTour({
  tour,
  labels,
  posterUrl,
  height = "clamp(320px, 62vh, 640px)",
  startOpen = false,
  sceneUrlSync,
  pinColor,
  onInquiry,
  onOpen,
}: {
  tour: VirtualTour;
  labels: ListingTourLabels;
  posterUrl?: string;
  height?: string;
  startOpen?: boolean;
  sceneUrlSync?: SceneUrlSyncMode;
  pinColor?: string;
  onInquiry?: (intent: InquiryIntent) => void;
  /** Fires once, when the buyer opens the tour (for the view counter). */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(tour.startSceneId);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([tour.startSceneId]));
  const apiRef = useRef<TourViewerApi | null>(null);

  const handleSceneChange = useCallback((sceneId: string) => {
    setCurrentSceneId(sceneId);
    setVisited((prev) => (prev.has(sceneId) ? prev : new Set(prev).add(sceneId)));
  }, []);

  const openTour = () => {
    setOpen(true);
    onOpen?.();
  };

  if (!open) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-slate-900" style={{ height }}>
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        ) : null}
        <button
          type="button"
          onClick={openTour}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white"
        >
          <span className="inline-flex min-h-12 items-center gap-2 rounded-full bg-black/70 px-6 text-base font-semibold shadow-lg backdrop-blur">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" />
            </svg>
            {labels.open}
          </span>
          <span className="rounded-full bg-black/60 px-3 py-1 text-sm">
            {labels.roomCount.replace("{n}", String(tour.scenes.length))}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-slate-900" style={{ height }}>
        <Tour
          tour={tour}
          labels={labels.viewer}
          height="100%"
          apiRef={apiRef}
          onSceneChange={handleSceneChange}
          sceneUrlSync={sceneUrlSync}
          pinColor={pinColor}
          onInquiry={onInquiry}
        />
      </div>
      <RoomStrip
        scenes={tour.scenes}
        floorPlans={tour.floorPlans}
        currentSceneId={currentSceneId}
        visitedSceneIds={visited}
        onSelect={(sceneId) => apiRef.current?.goToScene(sceneId)}
        labels={labels.rooms}
      />
    </div>
  );
}
