"use client";

import { useEffect, useState } from "react";

export type TopBarLabels = {
  back: string;
  save: string;
  saved: string;
  share: string;
  copied: string;
  sections: string;
  toolbar: string;
};

const SAVED_KEY = "rw:saved-listings";

function readSaved(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The slim sticky header (plans/08 6.1 item 0): back to the agency's
 * listings, Save and Share with visible labels, and section tabs that follow
 * the reader (scroll-spy). Save works without an account (this browser only);
 * syncing saved listings to an account is a later table (plans/08 6.3).
 */
export function ListingTopBar({
  slug,
  title,
  backHref,
  sections,
  labels,
}: {
  slug: string;
  title: string;
  backHref: string;
  /** Only the sections this listing has, in page order. */
  sections: { id: string; label: string }[];
  labels: TopBarLabels;
}) {
  const [saved, setSaved] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setSaved(readSaved().includes(slug));
  }, [slug]);

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        // The topmost visible section is the one being read.
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        setActive(top ? top[0] : null);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  const toggleSave = () => {
    const list = readSaved();
    const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      // Private mode or storage blocked: the toggle still reflects the tap.
    }
    setSaved(next.includes(slug));
  };

  const share = async () => {
    const url = window.location.href.split("#")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissed, or not allowed here: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote(labels.copied);
      window.setTimeout(() => setShareNote(""), 3000);
    } catch {
      setShareNote(url);
    }
  };

  const action =
    "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

  return (
    <div role="region" aria-label={labels.toolbar} className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4">
        <a href={backHref} className={action}>
          <span aria-hidden="true">←</span>
          {labels.back}
        </a>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleSave} aria-pressed={saved} className={action}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21Z" />
            </svg>
            {saved ? labels.saved : labels.save}
          </button>
          <button type="button" onClick={share} className={action}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6" />
            </svg>
            {labels.share}
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {shareNote}
      </p>
      {shareNote ? (
        <p className="mx-auto max-w-6xl px-4 pb-2 text-right text-sm text-slate-700" aria-hidden="true">
          {shareNote}
        </p>
      ) : null}
      {sections.length > 1 ? (
        <nav aria-label={labels.sections} className="mx-auto max-w-6xl overflow-x-auto px-4 [scrollbar-width:none]">
          <ul className="flex gap-1">
            {sections.map((section) => (
              <li key={section.id} className="flex-none">
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "location" : undefined}
                  className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-900 ${
                    active === section.id
                      ? "border-[var(--brand-accent)] text-slate-900"
                      : "border-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
