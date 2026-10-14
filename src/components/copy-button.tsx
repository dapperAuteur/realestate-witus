"use client";

import { useState } from "react";

/**
 * Click-to-copy for values users must transcribe exactly (DNS records —
 * BAM's minimize-human-error rule). Falls back to selecting nothing worse
 * than the visible text; announces the copy for screen readers.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked (http/permissions): leave the value selectable.
        }
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-left font-mono text-xs focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
    >
      <span className="break-all whitespace-pre-wrap">{value}</span>
      {/* slate-600, not slate-500: at 10px on a faintly tinted band slate-500
          measures 4.44:1 and misses AA. dark: keeps the dark side passing. */}
      <span
        aria-hidden="true"
        className="shrink-0 text-[10px] font-sans font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
      >
        {copied ? "✓" : "copy"}
      </span>
      <span className="sr-only">
        {copied ? `${label} copied` : `Copy ${label}`}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
