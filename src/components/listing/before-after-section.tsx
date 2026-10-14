"use client";

import { useId, useState } from "react";
import type { TimelineMoment, TourScene } from "@/components/tour/types";
import { useListing } from "./listing-provider";

export type BeforeAfterLabels = {
  title: string;
  intro: string;
  show: string;
  walk: string;
};

/**
 * Before / After for people who never open the tour (plans/08 6.1 item 6):
 * each room that has a photo for another time, with a toggle between its
 * times and a button that opens the 360 tour in that room, at that time.
 * The toggle is a radio group: the time on screen is always said in words.
 */
export function BeforeAfterSection({
  timeline,
  scenes,
  labels,
}: {
  timeline: TimelineMoment[];
  scenes: TourScene[];
  labels: BeforeAfterLabels;
}) {
  const rooms = scenes.filter((scene) => scene.moments?.length && scene.preview);
  if (rooms.length === 0) return null;
  return (
    <section id="before-after" aria-labelledby="before-after-title" className="scroll-mt-28">
      <h2 id="before-after-title" className="text-xl font-semibold text-slate-900">
        {labels.title}
      </h2>
      <p className="mt-1 text-slate-600">{labels.intro}</p>
      <ul className="mt-4 grid gap-6 sm:grid-cols-2">
        {rooms.map((room) => (
          <li key={room.id}>
            <RoomCompare room={room} timeline={timeline} labels={labels} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoomCompare({ room, timeline, labels }: { room: TourScene; timeline: TimelineMoment[]; labels: BeforeAfterLabels }) {
  const { openTourAt } = useListing();
  const name = useId();
  const withPhoto = new Set((room.moments ?? []).map((photo) => photo.momentId));
  const options = timeline.filter((moment) => moment.isBase || withPhoto.has(moment.id));
  // Open on the earliest time: "Before" first reads as the story it is.
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const moment = options.find((option) => option.id === selected);
  const photo = room.moments?.find((p) => p.momentId === selected);
  const src = moment?.isBase ? room.preview : photo?.preview;

  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="relative aspect-[2/1] bg-slate-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-slate-900 shadow-sm">
          {moment?.label}
        </span>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="font-semibold text-slate-900">{room.name}</span>
        <fieldset>
          <legend className="sr-only">
            {labels.show}: {room.name}
          </legend>
          <div className="inline-flex rounded-lg border border-slate-300 p-1">
            {options.map((option) => (
              <label key={option.id} className="cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={option.id}
                  checked={option.id === selected}
                  onChange={() => setSelected(option.id)}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-slate-700 peer-checked:bg-slate-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={() => openTourAt(room.id, moment?.isBase ? null : selected)}
          className="inline-flex min-h-11 items-center rounded-lg border-2 px-4 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
        >
          {labels.walk.replace("{room}", room.name).replace("{moment}", moment?.label ?? "")}
        </button>
      </figcaption>
    </figure>
  );
}
