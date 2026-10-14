"use client";

// Ported from wanderlearn-app src/components/virtual-tour/tour-links-overlay.tsx
// @ c7f5616, 2026-10-14 (plans/08). Extended for `kind: "inquiry"`: an inquiry
// link is a button that opens the listing's form ("Request a tour"), not a
// link to another site.

import { useEffect, useId, useRef, useState } from "react";
import {
  splitTourLinks,
  usableTourLinks,
  type InquiryIntent,
  type TourLink,
} from "@/lib/tour/tour-links";

export type TourLinksLabels = {
  /** Landmark name for the group. */
  group: string;
  /** Button text when a featured link sits beside it. */
  more: string;
  /** Button text when nothing is featured. */
  links: string;
  /** Appended for screen readers to URL links: they open a new tab. */
  opensInNewTab: string;
};

const ITEM_CLASS =
  "flex min-h-11 w-full items-center whitespace-nowrap rounded px-3 text-left text-sm hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const FEATURED_CLASS =
  "inline-flex min-h-11 items-center rounded-full border-2 border-white/80 px-4 text-sm font-bold shadow-lg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const FEATURED_STYLE = { background: "var(--brand-accent)", color: "var(--brand-accent-fg)" };

function linkKey(link: TourLink): string {
  return link.kind === "url" ? `url|${link.label}|${link.url}` : `inquiry|${link.label}|${link.intent}`;
}

/**
 * The listing's pinned actions, top-right in the viewer on every scene.
 *
 * Rendered (through a portal) INSIDE the element PSV sends fullscreen, so the
 * actions stay put in fullscreen too. Not in PSV's navbar: its buttons are
 * fixed at 40px and are divs without a button role, and these need real
 * controls at 44px.
 */
export function TourLinksOverlay({
  links,
  labels,
  onInquiry,
}: {
  links: TourLink[];
  labels: TourLinksLabels;
  /** Opens the listing's inquiry form. Without it, inquiry links are hidden. */
  onInquiry?: (intent: InquiryIntent) => void;
}) {
  const usable = usableTourLinks(links).filter((link) => link.kind === "url" || onInquiry);
  const { featured, others } = splitTourLinks(usable);
  const listed = featured ? others : usable;
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  if (usable.length === 0) return null;

  const activate = (link: TourLink) => {
    setOpen(false);
    if (link.kind === "inquiry") onInquiry?.(link.intent);
  };

  return (
    <nav
      ref={rootRef}
      aria-label={labels.group}
      className="absolute right-2 top-2 z-[95] flex max-w-[calc(100%-1rem)] flex-col items-end gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        // Only close when focus lands elsewhere on the page; a null
        // relatedTarget is a click the pointer listener handles.
        const next = event.relatedTarget as Node | null;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <div className="flex flex-wrap justify-end gap-2">
        {featured ? (
          featured.kind === "url" ? (
            <a
              href={featured.url}
              target="_blank"
              rel="noopener noreferrer"
              className={FEATURED_CLASS}
              style={FEATURED_STYLE}
            >
              {featured.label}
              <span className="sr-only"> ({labels.opensInNewTab})</span>
            </a>
          ) : (
            <button type="button" onClick={() => activate(featured)} className={FEATURED_CLASS} style={FEATURED_STYLE}>
              {featured.label}
            </button>
          )
        ) : null}
        {listed.length > 0 ? (
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-black/70 px-4 text-sm font-semibold text-white shadow-lg backdrop-blur hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {featured ? labels.more : labels.links}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`h-4 w-4 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
              fill="currentColor"
            >
              <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        ) : null}
      </div>
      <ul
        id={listId}
        hidden={!open}
        className="min-w-48 max-w-full rounded-md bg-black/85 p-1 text-white shadow-lg backdrop-blur"
      >
        {listed.map((link) => (
          <li key={linkKey(link)}>
            {link.kind === "url" ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={ITEM_CLASS}
              >
                <span className="truncate">{link.label}</span>
                <span className="sr-only"> ({labels.opensInNewTab})</span>
              </a>
            ) : (
              <button type="button" onClick={() => activate(link)} className={ITEM_CLASS}>
                <span className="truncate">{link.label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
