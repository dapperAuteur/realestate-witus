"use client";

// Ported from wanderlearn-app src/components/virtual-tour/moment-switcher.tsx
// @ c7f5616, 2026-10-14 (plans/08). Behavior unchanged; comments retargeted.

import { useId } from "react";

export type MomentSwitcherLabels = {
  /** Group name, e.g. "Time". */
  group: string;
  /** Announced when a scene has no photo for the chosen moment. `{moment}` and `{base}` are replaced. */
  fallback: string;
  /** Announced when a moment photo fails to load and the tour returns to the base view. */
  unavailable: string;
};

/**
 * Switches the time a scene shows (Before / After, Moments). Radios, so arrow keys move
 * between moments and a screen reader hears "Time, radio group"; a native
 * select below 640px, where a row of pills would crowd the panorama.
 * Only the variant on screen is in the accessibility tree (the other is
 * display: none).
 */
export function MomentSwitcher({
  options,
  value,
  onChange,
  labels,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (momentId: string) => void;
  labels: MomentSwitcherLabels;
}) {
  const name = useId();
  if (options.length < 2) return null;
  return (
    <>
      <fieldset className="hidden rounded-full bg-black/70 p-1 text-white shadow-lg backdrop-blur sm:block">
        <legend className="sr-only">{labels.group}</legend>
        <div className="flex flex-wrap items-center gap-1">
          <span aria-hidden="true" className="px-2 text-xs font-semibold uppercase tracking-wide text-white/80">
            {labels.group}
          </span>
          {options.map((option) => (
            <label key={option.id} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={option.id === value}
                onChange={() => onChange(option.id)}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:bg-white/15 peer-checked:bg-white peer-checked:text-black peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/70 px-3 text-sm font-semibold text-white shadow-lg backdrop-blur sm:hidden">
        {labels.group}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 rounded-md bg-white px-2 text-sm text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
