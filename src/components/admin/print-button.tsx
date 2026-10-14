"use client";

import { SECONDARY_BUTTON } from "./listing-form";

/** Opens the browser's print dialog, where "Save as PDF" makes the copy a seller can keep. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={SECONDARY_BUTTON}>
      {label}
    </button>
  );
}
