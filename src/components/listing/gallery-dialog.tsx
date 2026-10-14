"use client";

import { useEffect, useRef, useState } from "react";
import type { ListingPhoto } from "@/lib/listings/queries";

export type GalleryLabels = {
  gallery: string;
  close: string;
  previous: string;
  next: string;
  photoOf: string;
};

/**
 * The full gallery, in either of plans/03's modes (BAM compares them live):
 * - "lightbox": one photo at a time, previous / next, arrow keys and swipe
 * - "strip": every photo in one scrolling column, opened at the one tapped
 *
 * A native <dialog> opened with showModal(): the browser traps focus, Escape
 * closes, and focus returns to the photo that opened it.
 */
export function GalleryDialog({
  photos,
  mode,
  openAt,
  onClose,
  labels,
}: {
  photos: ListingPhoto[];
  mode: "lightbox" | "strip";
  /** Index to open at, or null when closed. */
  openAt: number | null;
  onClose: () => void;
  labels: GalleryLabels;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openAt === null) {
      if (dialog.open) dialog.close();
      return;
    }
    setIndex(openAt);
    if (!dialog.open) dialog.showModal();
    if (mode === "strip") {
      requestAnimationFrame(() => {
        dialog.querySelector(`[data-photo-index="${openAt}"]`)?.scrollIntoView({ block: "start" });
      });
    }
  }, [openAt, mode]);

  const total = photos.length;
  const go = (delta: number) => setIndex((i) => (i + delta + total) % total);
  const photo = photos[index];

  return (
    <dialog
      ref={dialogRef}
      aria-label={labels.gallery}
      onClose={onClose}
      onKeyDown={(event) => {
        if (mode !== "lightbox") return;
        if (event.key === "ArrowLeft") go(-1);
        if (event.key === "ArrowRight") go(1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-slate-950 p-0 text-white backdrop:bg-slate-950/90"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-slate-950/90 px-4 py-2">
        <p aria-live="polite" className="text-sm">
          {mode === "lightbox" && photo
            ? labels.photoOf.replace("{n}", String(index + 1)).replace("{total}", String(total))
            : labels.gallery}
        </p>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 px-4 font-semibold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {labels.close}
        </button>
      </div>

      {mode === "lightbox" ? (
        photo ? (
          <div
            className="relative flex h-[calc(100dvh-3.75rem)] items-center justify-center"
            onTouchStart={(event) => {
              touchX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchX.current;
              const end = event.changedTouches[0]?.clientX;
              touchX.current = null;
              if (start === null || end === undefined || Math.abs(end - start) < 40) return;
              go(end < start ? 1 : -1);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.alt} className="max-h-full max-w-full object-contain" />
            {total > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={labels.previous}
                  className="absolute left-2 top-1/2 inline-flex min-h-12 min-w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label={labels.next}
                  className="absolute right-2 top-1/2 inline-flex min-h-12 min-w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}
          </div>
        ) : null
      ) : (
        <ol className="mx-auto flex max-w-4xl flex-col gap-3 px-2 pb-8">
          {photos.map((p, i) => (
            <li key={p.id} data-photo-index={i} className="scroll-mt-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt} loading="lazy" className="w-full rounded-lg" />
            </li>
          ))}
        </ol>
      )}
    </dialog>
  );
}
