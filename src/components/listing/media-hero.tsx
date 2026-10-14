"use client";

import { useRef, useState } from "react";
import type { ListingPhoto } from "@/lib/listings/queries";
import { GalleryDialog, type GalleryLabels } from "./gallery-dialog";
import { StatusChip } from "./status-chip";

export type MediaHeroLabels = GalleryLabels & {
  viewAll: string;
  openPhoto: string;
  jumpTo: string;
  status: string;
  chips: { tour: string; floorPlan: string; beforeAfter: string; map: string };
  badge360: string;
};

/**
 * The media hero (plans/08 6.1 item 1, design lock 2026-10-14):
 * - desktop: one large photo and four small ones, "View all N photos" on the last tile
 * - phone: a swipeable strip with an "N of M" count
 * - the status chip on the photo, as a dot plus a word
 * - labeled chips below jumping to the tour, floor plan, Before / After and map
 *
 * The first photo is the page's LCP image: eager, high priority, sized by srcset.
 */
export function MediaHero({
  photos,
  status,
  galleryMode,
  sections,
  labels,
}: {
  photos: ListingPhoto[];
  status: "for_sale" | "under_offer" | "sold" | "draft" | "withdrawn";
  galleryMode: "lightbox" | "strip";
  sections: { tour: boolean; floorPlan: boolean; beforeAfter: boolean; map: boolean };
  labels: MediaHeroLabels;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [stripIndex, setStripIndex] = useState(0);
  const stripRef = useRef<HTMLOListElement>(null);
  const total = photos.length;

  const chips = [
    sections.tour ? { href: "#tour", label: labels.chips.tour, badge: true } : null,
    sections.floorPlan ? { href: "#floor-plan", label: labels.chips.floorPlan } : null,
    sections.beforeAfter ? { href: "#tour", label: labels.chips.beforeAfter } : null,
    sections.map ? { href: "#location", label: labels.chips.map } : null,
  ].filter((chip): chip is { href: string; label: string; badge?: boolean } => chip !== null);

  const srcSet = (photo: ListingPhoto) => `${photo.thumbUrl} 640w, ${photo.url} 1600w`;
  const tileButton =
    "group relative block h-full w-full overflow-hidden focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white";

  return (
    <div>
      {total > 0 ? (
        <>
          {/* Desktop mosaic */}
          <div
            className={`relative hidden h-[clamp(320px,56vh,560px)] gap-2 overflow-hidden rounded-2xl md:grid ${
              total >= 5 ? "grid-cols-4 grid-rows-2" : total >= 3 ? "grid-cols-3 grid-rows-2" : "grid-cols-1"
            }`}
          >
            {photos.slice(0, total >= 5 ? 5 : total >= 3 ? 3 : 1).map((photo, i, shown) => {
              const isLast = i === shown.length - 1 && total > 1;
              return (
                <div
                  key={photo.id}
                  className={i === 0 && total >= 3 ? "col-span-2 row-span-2" : i === 0 ? "row-span-2" : ""}
                >
                  <button
                    type="button"
                    onClick={() => setOpenAt(i)}
                    aria-label={labels.openPhoto.replace("{n}", String(i + 1))}
                    className={tileButton}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i === 0 ? photo.url : photo.thumbUrl}
                      srcSet={srcSet(photo)}
                      sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "25vw"}
                      alt={photo.alt}
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : undefined}
                      className="h-full w-full object-cover transition group-hover:brightness-95"
                    />
                  </button>
                  {isLast ? (
                    <button
                      type="button"
                      onClick={() => setOpenAt(0)}
                      className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 shadow-md hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                        <path d="M3 3h6v6H3V3Zm8 0h6v6h-6V3ZM3 11h6v6H3v-6Zm8 0h6v6h-6v-6Z" />
                      </svg>
                      {labels.viewAll.replace("{n}", String(total))}
                    </button>
                  ) : null}
                </div>
              );
            })}
            <div className="pointer-events-none absolute left-4 top-4">
              <StatusChip status={status} label={labels.status} />
            </div>
          </div>

          {/* Phone strip */}
          <div className="relative -mx-4 md:hidden">
            <ol
              ref={stripRef}
              className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
              onScroll={(event) => {
                const el = event.currentTarget;
                setStripIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
              }}
            >
              {photos.map((photo, i) => (
                <li key={photo.id} className="w-full flex-none snap-center">
                  <button
                    type="button"
                    onClick={() => setOpenAt(i)}
                    aria-label={labels.openPhoto.replace("{n}", String(i + 1))}
                    className="block aspect-[4/3] w-full focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      srcSet={srcSet(photo)}
                      sizes="100vw"
                      alt={photo.alt}
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : undefined}
                      className="h-full w-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ol>
            <div className="pointer-events-none absolute left-4 top-3">
              <StatusChip status={status} label={labels.status} />
            </div>
            {total > 1 ? (
              <p className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">
                {labels.photoOf.replace("{n}", String(Math.min(total, stripIndex + 1))).replace("{total}", String(total))}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <StatusChip status={status} label={labels.status} />
      )}

      {chips.length > 0 ? (
        <nav aria-label={labels.jumpTo} className="mt-3">
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.label}>
                <a
                  href={chip.href}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  {chip.badge ? (
                    <span
                      aria-hidden="true"
                      className="rounded-full px-1.5 text-[0.625rem] font-bold"
                      style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                    >
                      {labels.badge360}
                    </span>
                  ) : null}
                  {chip.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <GalleryDialog photos={photos} mode={galleryMode} openAt={openAt} onClose={() => setOpenAt(null)} labels={labels} />
    </div>
  );
}
