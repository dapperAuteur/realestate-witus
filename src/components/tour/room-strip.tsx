"use client";

// Ported from wanderlearn-app src/components/virtual-tour/tour-stop-rail.tsx
// @ c7f5616, 2026-10-14 (plans/08). "Stops" became rooms, thumbnails were added
// (plans/03: a scene strip with thumbnails), and rooms on a different floor
// carry the floor's name when the listing has more than one.

import { useEffect, useRef } from "react";
import type { TourFloorPlan, TourScene } from "./types";

export type RoomStripLabels = {
  /** Accessible name for the strip's nav landmark. */
  region: string;
  /** "Room {n} of {total}". */
  position: string;
  /** "{n} left to see". */
  remaining: string;
  /** Announced on every arrival: "Now in {name}". */
  nowIn: string;
  visited: string;
  current: string;
  allSeen: string;
};

/**
 * Where am I, and what's left. Getting lost is the most-documented reason
 * people abandon a 360 tour, and arrows alone never say how much remains.
 *
 * Counts are real (the actual room list), and every room is one tap away, so
 * a buyer is never stuck in a dead end. `scenes` arrives in visit order from
 * build-tour; this component does not re-sort.
 */
export function RoomStrip({
  scenes,
  floorPlans,
  currentSceneId,
  visitedSceneIds,
  onSelect,
  labels,
}: {
  scenes: TourScene[];
  floorPlans?: TourFloorPlan[];
  currentSceneId: string | null;
  visitedSceneIds: ReadonlySet<string>;
  onSelect: (sceneId: string) => void;
  labels: RoomStripLabels;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const currentIndex = scenes.findIndex((scene) => scene.id === currentSceneId);
  const total = scenes.length;
  const floorLabelById = new Map((floorPlans ?? []).map((plan) => [plan.id, plan.label]));
  const showFloors = floorLabelById.size > 1;

  // Keep the current room in view. `block: "nearest"` so the strip never
  // scrolls the PAGE vertically out from under someone mid-look.
  useEffect(() => {
    if (currentIndex < 0) return;
    const node = listRef.current?.children[currentIndex];
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentIndex]);

  if (total <= 1) return null;

  const remaining = scenes.filter((scene) => !visitedSceneIds.has(scene.id)).length;
  const currentScene = currentIndex >= 0 ? scenes[currentIndex] : null;

  return (
    <nav aria-label={labels.region} className="mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {labels.position
            .replace("{n}", String(currentIndex >= 0 ? currentIndex + 1 : 1))
            .replace("{total}", String(total))}
        </p>
        <p className="text-xs text-slate-600">
          {remaining === 0 ? labels.allSeen : labels.remaining.replace("{n}", String(remaining))}
        </p>
      </div>

      {/* The rooms are buttons, so focus stays on the one pressed while the
          panorama changes: this region says where the buyer now is. */}
      <p aria-live="polite" className="sr-only">
        {currentScene ? labels.nowIn.replace("{name}", currentScene.name) : ""}
      </p>

      {/* Horizontal scroll stays inside this list, never the page. */}
      <ol ref={listRef} className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {scenes.map((scene, index) => {
          const isCurrent = scene.id === currentSceneId;
          const isVisited = visitedSceneIds.has(scene.id);
          const floor = showFloors && scene.floorPlanId ? floorLabelById.get(scene.floorPlanId) : undefined;
          return (
            <li key={scene.id} className="flex-none">
              <button
                type="button"
                onClick={() => onSelect(scene.id)}
                aria-current={isCurrent ? "step" : undefined}
                // State lives in the name, not in color alone.
                aria-label={`${index + 1}. ${scene.name}${floor ? `, ${floor}` : ""}${
                  isCurrent ? `, ${labels.current}` : isVisited ? `, ${labels.visited}` : ""
                }`}
                className={[
                  "flex w-36 flex-col overflow-hidden rounded-lg border-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
                  isCurrent ? "border-[var(--brand-accent)]" : "border-slate-200 hover:border-slate-400",
                ].join(" ")}
              >
                {scene.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.thumbnail} alt="" loading="lazy" className="aspect-[2/1] w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="aspect-[2/1] w-full bg-slate-100" />
                )}
                <span className="flex min-h-11 flex-col justify-center gap-0.5 px-2 py-1.5">
                  <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-slate-600">
                    {index + 1}
                    {/* A checkmark survives grayscale and high-contrast mode. */}
                    {isVisited && !isCurrent ? " ✓" : ""}
                    {floor ? ` · ${floor}` : ""}
                  </span>
                  <span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900">
                    {scene.name}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
