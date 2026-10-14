"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { connectRoomsAction, disconnectRoomsAction } from "@/app/[lang]/admin/listings/actions";
import type en from "@/dictionaries/en.json";
import { ROOM_MAP, edgeLine, neighborsOf, roomMapLayout } from "@/lib/tour/room-map";
import { HINT, SECONDARY_BUTTON } from "./listing-form";

// The room map (plans/04, "graph mode"): every room as a card, every pair of
// rooms with a doorway as a line, laid out by walking distance from the
// start room. Pick a room, then pick another, to connect them both ways; the
// picked room's panel lists its doorways with a remove button each. It's the
// quick visual check after a spreadsheet import. Every card is a button, so
// the keyboard path is the same as the pointer's, and the list-based
// Connections editor stays as the full equivalent (and the only one on a
// phone: this map needs a wide screen).

export type RoomMapLabels = (typeof en)["admin"]["tour"]["map"];

export interface RoomMapScene {
  id: string;
  name: string;
  thumbUrl: string | null;
  isStart: boolean;
  /** Problems already worded for the Rooms list ("Nothing leads here"). */
  flags: string[];
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

export function RoomMap({
  listingId,
  scenes,
  links,
  startSceneId,
  editBase,
  labels,
}: {
  listingId: string;
  scenes: RoomMapScene[];
  links: { fromSceneId: string; toSceneId: string; placed: boolean }[];
  startSceneId: string | null;
  /** The room editor's base path: `${editBase}/${sceneId}`. */
  editBase: string;
  labels: RoomMapLabels;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const layout = useMemo(
    () => roomMapLayout({ sceneIds: scenes.map((s) => s.id), links, startSceneId }),
    [scenes, links, startSceneId],
  );
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const nameOf = (id: string) => byId.get(id)?.name ?? "";
  const picked = selected ? byId.get(selected) : undefined;
  const pickedNeighbors = selected ? neighborsOf(selected, layout.edges) : [];

  async function choose(id: string) {
    if (busy) return;
    if (!selected || selected === id) {
      setSelected(selected === id ? null : id);
      setStatus(selected === id ? "" : fill(labels.picked, { name: nameOf(id) }));
      return;
    }
    const names = { a: nameOf(selected), b: nameOf(id) };
    if (neighborsOf(selected, layout.edges).includes(id)) {
      setStatus(fill(labels.already, names));
      return;
    }
    setBusy(true);
    const result = await connectRoomsAction(listingId, selected, id);
    setBusy(false);
    setStatus(result.ok ? fill(labels.connected, names) : result.error);
    if (result.ok) router.refresh();
  }

  async function disconnect(other: string) {
    if (!selected || busy) return;
    setBusy(true);
    const result = await disconnectRoomsAction(listingId, selected, other);
    setBusy(false);
    setStatus(result.ok ? fill(labels.removed, { a: nameOf(selected), b: nameOf(other) }) : result.error);
    if (!result.ok) return;
    // Its button is gone with the doorway: keep the keyboard on the picked room.
    cards.current.get(selected)?.focus();
    router.refresh();
  }

  const { nodeWidth, nodeHeight } = ROOM_MAP;

  return (
    <>
      <p className="mt-2 text-sm md:hidden">{labels.narrow}</p>
      <div
        className="hidden md:block"
        onKeyDown={(event) => {
          if (event.key === "Escape" && selected) {
            setSelected(null);
            setStatus("");
          }
        }}
      >
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
          <li className="flex items-center gap-2">
            <svg aria-hidden="true" width="32" height="8">
              <line x1="0" y1="4" x2="32" y2="4" strokeWidth="2" className="stroke-slate-500 dark:stroke-slate-400" />
            </svg>
            {labels.legendBoth}
          </li>
          <li className="flex items-center gap-2">
            <svg aria-hidden="true" width="32" height="8">
              <line x1="0" y1="4" x2="32" y2="4" strokeWidth="2" strokeDasharray="6 4" className="stroke-slate-500 dark:stroke-slate-400" />
            </svg>
            {labels.legendOneWay}
          </li>
          <li className="flex items-center gap-2">
            <svg aria-hidden="true" width="32" height="8">
              <line x1="0" y1="4" x2="32" y2="4" strokeWidth="3" className="stroke-amber-600 dark:stroke-amber-400" />
            </svg>
            {labels.legendUnplaced}
          </li>
        </ul>
        <div className="mt-3 max-h-[36rem] overflow-auto rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="relative" style={{ width: layout.width, height: layout.height }}>
            <svg aria-hidden="true" width={layout.width} height={layout.height} className="absolute inset-0">
              <defs>
                <marker id="room-map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="fill-slate-500 dark:fill-slate-400" />
                </marker>
              </defs>
              {layout.edges.map((edge) => {
                // One-way lines run from the room that leads, so the arrowhead marks where it goes.
                const [from, to] = edge.direction === "b-to-a" ? [edge.b, edge.a] : [edge.a, edge.b];
                const line = edgeLine(layout.nodes.get(from)!, layout.nodes.get(to)!);
                const touchesPicked = selected === edge.a || selected === edge.b;
                return (
                  <line
                    key={`${edge.a}|${edge.b}`}
                    {...line}
                    strokeWidth={edge.placed ? (touchesPicked ? 3 : 2) : 3}
                    strokeDasharray={edge.direction === "both" ? undefined : "6 4"}
                    markerEnd={edge.direction === "both" ? undefined : "url(#room-map-arrow)"}
                    className={
                      edge.placed ? "stroke-slate-500 dark:stroke-slate-400" : "stroke-amber-600 dark:stroke-amber-400"
                    }
                  />
                );
              })}
            </svg>
            {scenes.map((scene) => {
              const at = layout.nodes.get(scene.id);
              if (!at) return null;
              const count = neighborsOf(scene.id, layout.edges).length;
              const isPicked = selected === scene.id;
              const label = [
                scene.name,
                scene.isStart ? labels.start : null,
                fill(count === 1 ? labels.oneDoorway : labels.doorways, { n: String(count) }),
                ...scene.flags,
              ]
                .filter(Boolean)
                .join(". ");
              return (
                <button
                  key={scene.id}
                  ref={(el) => void (el ? cards.current.set(scene.id, el) : cards.current.delete(scene.id))}
                  type="button"
                  aria-pressed={isPicked}
                  aria-label={label}
                  // aria-disabled, not disabled: a disabled button drops the keyboard's focus mid-request.
                  aria-disabled={busy || undefined}
                  onClick={() => void choose(scene.id)}
                  className={`absolute flex items-center gap-2 rounded-lg border-2 bg-white p-1.5 text-left text-sm font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 aria-disabled:cursor-wait dark:bg-slate-950 ${
                    isPicked
                      ? "border-slate-900 ring-2 ring-slate-900 dark:border-white dark:ring-white"
                      : scene.flags.length
                        ? "border-amber-500"
                        : "border-slate-300 dark:border-slate-700"
                  }`}
                  style={{ left: at.x - nodeWidth / 2, top: at.y - nodeHeight / 2, width: nodeWidth, height: nodeHeight }}
                >
                  {scene.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={scene.thumbUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="line-clamp-2 leading-tight">{scene.name}</span>
                    {scene.isStart ? (
                      <span className="mt-0.5 inline-block rounded-full bg-slate-900 px-1.5 text-[11px] text-white dark:bg-slate-100 dark:text-slate-900">
                        {labels.start}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm font-medium">
          {status}
        </p>
        {picked ? (
          <div className="mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="font-semibold">{picked.name}</p>
            {picked.flags.length ? (
              <ul className="mt-1 flex flex-wrap gap-1">
                {picked.flags.map((flag) => (
                  <li key={flag} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                    {flag}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-sm font-medium">{labels.joinedTo}</p>
            {pickedNeighbors.length ? (
              <ul className="mt-1 flex flex-col gap-2">
                {pickedNeighbors.map((id) => (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">{nameOf(id)}</span>
                    <button type="button" aria-disabled={busy || undefined} onClick={() => void disconnect(id)} className={SECONDARY_BUTTON}>
                      {fill(labels.remove, { name: nameOf(id) })}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm">{labels.none}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`${editBase}/${picked.id}`} className={SECONDARY_BUTTON}>
                {labels.edit}
                <span className="sr-only">: {picked.name}</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setStatus("");
                }}
                className={SECONDARY_BUTTON}
              >
                {labels.done}
              </button>
            </div>
          </div>
        ) : (
          <p className={HINT}>{labels.howTo}</p>
        )}
      </div>
    </>
  );
}
