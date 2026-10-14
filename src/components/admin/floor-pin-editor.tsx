"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { placeOnPlanAction } from "@/app/[lang]/admin/listings/actions";

// Floor-plan pins (plans/08 6.4, phase D). Choose a room, click its spot on
// the plan. The keyboard path is equivalent, not an afterthought: every pin is
// a button, and arrow keys move a focused pin (Shift for bigger steps); the
// "arrange" button gives unpinned rooms a starting place to nudge from.

export interface PinRoom {
  id: string;
  name: string;
  floorPlanId: string | null;
  mapX: number | null;
  mapY: number | null;
}

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900";

export function FloorPinEditor({
  floorPlanId,
  plan,
  rooms,
  labels,
}: {
  floorPlanId: string;
  plan: { imageUrl: string; width: number; height: number; label: string };
  rooms: PinRoom[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(rooms.find((r) => r.floorPlanId === floorPlanId)?.id ?? rooms[0]?.id ?? null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [nudged, setNudged] = useState<Record<string, { x: number; y: number }>>({});
  const saveTimer = useRef<number | null>(null);
  const onFloor = rooms.filter((room) => room.floorPlanId === floorPlanId);
  const selectedRoom = rooms.find((room) => room.id === selected) ?? null;

  async function place(roomId: string, floor: string | null, point: { x: number; y: number } | null) {
    setBusy(true);
    const result = await placeOnPlanAction(roomId, floor, point);
    setBusy(false);
    setStatus(result.ok ? labels.saved : result.error);
    if (result.ok) router.refresh();
  }

  function onPlanClick(event: MouseEvent<HTMLDivElement>) {
    if (!selected || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    void place(selected, floorPlanId, { x, y });
  }

  function onPinKey(event: KeyboardEvent<HTMLButtonElement>, room: PinRoom) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta =
      event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : null;
    if (!delta) return;
    event.preventDefault();
    const current = nudged[room.id] ?? { x: room.mapX ?? 0.5, y: room.mapY ?? 0.5 };
    const next = { x: Math.min(1, Math.max(0, current.x + delta[0])), y: Math.min(1, Math.max(0, current.y + delta[1])) };
    setNudged((prev) => ({ ...prev, [room.id]: next }));
    // Save once the keys stop, not on every press.
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void place(room.id, floorPlanId, next), 600);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <p className="mb-2 text-sm font-medium" aria-live="polite">
          {selectedRoom ? labels.selected.replace("{room}", selectedRoom.name) : ""}
        </p>
        <div
          onClick={onPlanClick}
          className="relative mx-auto cursor-crosshair overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800"
          style={{ aspectRatio: `${plan.width} / ${plan.height}`, maxWidth: plan.width }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plan.imageUrl} alt={labels.planAlt.replace("{floor}", plan.label)} className="absolute inset-0 h-full w-full object-contain" draggable={false} />
          {onFloor
            .filter((room) => room.mapX !== null && room.mapY !== null)
            .map((room) => {
              const point = nudged[room.id] ?? { x: room.mapX!, y: room.mapY! };
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(room.id);
                  }}
                  onKeyDown={(event) => onPinKey(event, room)}
                  aria-label={labels.pinFor.replace("{room}", room.name)}
                  aria-pressed={selected === room.id}
                  className="absolute inline-flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-slate-900 shadow ring-2 ring-slate-400 aria-pressed:ring-4 aria-pressed:ring-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                >
                  {room.name}
                </button>
              );
            })}
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm">
          {status}
        </p>
      </div>

      <fieldset>
        <legend className="font-semibold">{labels.room}</legend>
        <ul className="mt-2 flex flex-col gap-2">
          {rooms.map((room) => {
            const here = room.floorPlanId === floorPlanId;
            return (
              <li key={room.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="room" checked={selected === room.id} onChange={() => setSelected(room.id)} className="h-5 w-5" />
                  <span className="font-medium">{room.name}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{here ? labels.onFloor : labels.notOnFloor}</span>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void place(room.id, here ? null : floorPlanId, null)}
                  className={BUTTON}
                >
                  {here ? labels.removeFromFloor : labels.addToFloor}
                  <span className="sr-only">: {room.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}
