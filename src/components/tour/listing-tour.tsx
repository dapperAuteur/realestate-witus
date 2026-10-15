"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomStayTracker, type RoomStay } from "@/lib/tour/room-stays";
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
  request,
  roomStrip = true,
  posterPriority = false,
  onRoomStay,
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
  /**
   * Open at a room from elsewhere on the page (the floor plan). Opens the tour
   * there if it is still a poster, or walks to it if it is already open. A new
   * `nonce` makes the same room twice still count.
   */
  request?: { sceneId: string | null; momentId?: string | null; nonce: number } | null;
  /** The embed leaves it out: a fixed-height iframe has no room under the viewer. */
  roomStrip?: boolean;
  /** The poster is the page's LCP image (the landing hero), so fetch it first. */
  posterPriority?: boolean;
  /**
   * Time in each room, for "which rooms held buyers" (room-stays.ts). Leave it
   * out (the landing) and nothing is measured.
   */
  onRoomStay?: (stay: RoomStay) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  // Set only BEFORE the viewer mounts: changing the tour after would rebuild it.
  const [startOverride, setStartOverride] = useState<string | null>(null);
  const [startMoment, setStartMoment] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
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

  useEffect(() => {
    if (!request) return;
    const known = request.sceneId && tour.scenes.some((scene) => scene.id === request.sceneId);
    if (!openRef.current) {
      if (known && request.sceneId) {
        setStartOverride(request.sceneId);
        setCurrentSceneId(request.sceneId);
        setVisited(new Set([request.sceneId]));
      }
      if (request.momentId) setStartMoment(request.momentId);
      setOpen(true);
      onOpen?.();
    } else {
      if (request.momentId) apiRef.current?.showMoment(request.momentId);
      if (known && request.sceneId) apiRef.current?.goToScene(request.sceneId);
    }
    // Only a new request should act, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  // Room timing: one tracker per mounted tour, fed by the room on screen and
  // the tab's visibility. The callback lives in a ref so a re-render never
  // restarts the clock.
  const stayRef = useRef(onRoomStay);
  stayRef.current = onRoomStay;
  const trackerRef = useRef<RoomStayTracker | null>(null);
  const measuring = Boolean(onRoomStay);
  useEffect(() => {
    if (!open || !measuring) return;
    const tracker = new RoomStayTracker(
      () => Date.now(),
      (stay) => stayRef.current?.(stay),
    );
    trackerRef.current = tracker;
    const onVisibility = () => (document.visibilityState === "hidden" ? tracker.hide() : tracker.show());
    const onPageHide = () => tracker.hide();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      tracker.close();
      trackerRef.current = null;
    };
  }, [open, measuring]);
  useEffect(() => {
    if (open && currentSceneId) trackerRef.current?.enter(currentSceneId);
  }, [open, currentSceneId, measuring]);

  const viewerTour = useMemo(
    () => (startOverride ? { ...tour, startSceneId: startOverride } : tour),
    [tour, startOverride],
  );

  if (!open) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-slate-900" style={{ height }}>
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            fetchPriority={posterPriority ? "high" : undefined}
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
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
    <div className={roomStrip ? undefined : "h-full"}>
      <div className="overflow-hidden rounded-xl bg-slate-900" style={{ height }}>
        <Tour
          tour={viewerTour}
          initialMomentId={startMoment}
          labels={labels.viewer}
          height="100%"
          apiRef={apiRef}
          onSceneChange={handleSceneChange}
          sceneUrlSync={sceneUrlSync}
          pinColor={pinColor}
          onInquiry={onInquiry}
        />
      </div>
      {roomStrip ? (
      <RoomStrip
        scenes={tour.scenes}
        floorPlans={tour.floorPlans}
        currentSceneId={currentSceneId}
        visitedSceneIds={visited}
        onSelect={(sceneId) => apiRef.current?.goToScene(sceneId)}
        labels={labels.rooms}
      />
      ) : null}
    </div>
  );
}
