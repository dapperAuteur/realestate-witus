"use client";

import { useId, useState } from "react";
import type { TourFloorPlan, TourScene } from "@/components/tour/types";
import { useListing } from "./listing-provider";

export type FloorPlanLabels = {
  title: string;
  intro: string;
  floors: string;
  openRoom: string;
  planAlt: string;
};

/**
 * The interactive floor plan (plans/08 6.4): the portal feature we beat. Both
 * portals show a static image; here every pinned room is a labeled button
 * that opens the 360 tour in that room. With more than one floor, a radio
 * group switches plans.
 */
export function FloorPlanSection({
  floorPlans,
  scenes,
  labels,
}: {
  floorPlans: TourFloorPlan[];
  scenes: TourScene[];
  labels: FloorPlanLabels;
}) {
  const { openTourAt } = useListing();
  const [floorId, setFloorId] = useState(floorPlans[0]?.id ?? "");
  const name = useId();
  const plan = floorPlans.find((p) => p.id === floorId) ?? floorPlans[0];
  if (!plan) return null;
  const rooms = scenes.filter((scene) => scene.floorPlanId === plan.id && scene.mapPosition);

  return (
    <section id="floor-plan" aria-labelledby="floor-plan-title" className="scroll-mt-28">
      <h2 id="floor-plan-title" className="text-xl font-semibold text-slate-900">
        {labels.title}
      </h2>
      <p className="mt-1 text-slate-600">{labels.intro}</p>

      {floorPlans.length > 1 ? (
        <fieldset className="mt-3">
          <legend className="sr-only">{labels.floors}</legend>
          <div className="inline-flex flex-wrap rounded-lg border border-slate-300 p-1">
            {floorPlans.map((p) => (
              <label key={p.id} className="cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={p.id}
                  checked={p.id === plan.id}
                  onChange={() => setFloorId(p.id)}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-slate-700 peer-checked:bg-slate-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900">
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div className="relative mx-auto" style={{ aspectRatio: `${plan.width} / ${plan.height}`, maxWidth: plan.width }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={plan.imageUrl}
            alt={labels.planAlt.replace("{floor}", plan.label)}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain"
          />
          <ul>
            {rooms.map((room) => (
              <li
                key={room.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${room.mapPosition!.x * 100}%`, top: `${room.mapPosition!.y * 100}%` }}
              >
                <button
                  type="button"
                  onClick={() => openTourAt(room.id)}
                  aria-label={labels.openRoom.replace("{room}", room.name)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-semibold text-slate-900 shadow-md ring-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  style={{ ["--tw-ring-color" as string]: "var(--brand-accent)" }}
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand-accent)" }} />
                  {room.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
