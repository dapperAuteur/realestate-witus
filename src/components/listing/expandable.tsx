"use client";

import { useId, useState } from "react";

/**
 * The agent's description, cut after a few lines with "Read more" (both
 * portals do this). The full text is always in the DOM, so search engines
 * and screen readers get all of it; only the visual clamp changes.
 */
export function ExpandableText({
  paragraphs,
  readMore,
  readLess,
}: {
  paragraphs: string[];
  readMore: string;
  readLess: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = paragraphs.join(" ").length > 420 || paragraphs.length > 2;
  return (
    <div>
      <div id={id} className={`space-y-3 text-slate-800 ${long && !open ? "line-clamp-5" : ""}`}>
        {paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-slate-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {open ? readLess : readMore}
        </button>
      ) : null}
    </div>
  );
}

const VISIBLE = 6;

/** One facts-and-features group; long lists collapse behind "Show all N". */
export function FeatureGroup({
  heading,
  items,
  showMore,
  showLess,
}: {
  heading: string;
  items: string[];
  showMore: string;
  showLess: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = open ? items : items.slice(0, VISIBLE);
  return (
    <div>
      <h3 className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
        {heading}
      </h3>
      <ul id={id} className="mt-2 list-disc space-y-1 pl-8 text-slate-800">
        {shown.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {items.length > VISIBLE ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex min-h-11 items-center pl-3 text-sm font-semibold text-slate-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {open ? showLess : showMore.replace("{n}", String(items.length))}
        </button>
      ) : null}
    </div>
  );
}
