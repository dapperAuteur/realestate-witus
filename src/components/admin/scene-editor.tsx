"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import {
  deleteHotspotAction,
  saveHotspotAction,
  updateLinkAction,
  updateSceneAction,
} from "@/app/[lang]/admin/listings/actions";
import { Tour, type PositionClick, type TourViewerApi, type TourViewerLabels } from "@/components/tour/tour";
import type { VirtualTour } from "@/components/tour/types";
import { ROLL_LIMIT_DEG } from "@/lib/tour/tour-input";
import { VIEW_LIMIT_DEFAULT_DEG, VIEW_LIMIT_MAX_DEG, VIEW_LIMIT_MIN_DEG } from "@/lib/tour/view-limit";

// The room editor (plans/08 phase D: click-to-place arrows and hotspots,
// arrival headings, start view, view limit, horizon roll). Built on the same
// viewer buyers use, so what BAM places is exactly what buyers get. Every
// control is a real button or input: the panorama click is a convenience,
// never the only way to see or undo something.

type Labels = Record<string, string>;

export interface EditorLink {
  id: string;
  otherSceneId: string;
  otherName: string;
  name: string | null;
  placed: boolean;
  hasArrival: boolean;
  arrowRotation: number;
}

export interface EditorHotspot {
  id: string;
  yaw: number;
  pitch: number;
  title: string;
  content: string | null;
  externalUrl: string | null;
  momentId: string | null;
}

type Mode = { kind: "look" } | { kind: "arrow"; linkId: string; room: string } | { kind: "hotspot" };

const FIELD =
  "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900";

export function SceneEditor({
  tour,
  sceneId,
  initial,
  outgoing,
  incoming,
  hotspots,
  moments,
  editorBase,
  labels,
  viewerLabels,
  pinColor,
}: {
  tour: VirtualTour | null;
  sceneId: string;
  initial: { name: string; caption: string | null; roll: number | null; viewLimit: number | null };
  outgoing: EditorLink[];
  incoming: EditorLink[];
  hotspots: EditorHotspot[];
  moments: { id: string; label: string }[];
  /** `/en/admin/listings/<id>/tour`: each room's editor lives under it. */
  editorBase: string;
  labels: Labels;
  viewerLabels: TourViewerLabels;
  pinColor?: string;
}) {
  const router = useRouter();
  const apiRef = useRef<TourViewerApi | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "look" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<(Omit<EditorHotspot, "id"> & { id: string | null }) | null>(null);
  const [roll, setRoll] = useState(initial.roll ?? 0);
  const [limitOn, setLimitOn] = useState(initial.viewLimit !== null);
  const [limit, setLimit] = useState(initial.viewLimit ?? VIEW_LIMIT_DEFAULT_DEG);
  const ids = { name: useId(), caption: useId(), roll: useId(), limit: useId() };

  const run = useCallback(
    async (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
      setBusy(true);
      const result = await work();
      setBusy(false);
      setStatus(result.ok ? done : (result.error ?? labels.saved));
      if (result.ok) router.refresh();
    },
    [router, labels.saved],
  );

  // Stable identity on purpose: the viewer rebuilds (reloading the panorama)
  // whenever this callback changes, so the current mode is read from a ref.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const runRef = useRef(run);
  runRef.current = run;
  const onPositionClick = useCallback(
    (position: PositionClick) => {
      const current = modeRef.current;
      if (current.kind === "arrow") {
        void runRef.current(
          () => updateLinkAction(current.linkId, { kind: "place", yaw: position.yaw, pitch: position.pitch }),
          labels.saved,
        );
        setMode({ kind: "look" });
      } else if (current.kind === "hotspot") {
        setDraft({ id: null, yaw: position.yaw, pitch: position.pitch, title: "", content: null, externalUrl: null, momentId: null });
        setStatus(labels.placedHere);
        setMode({ kind: "look" });
      }
    },
    [labels.saved, labels.placedHere],
  );

  const position = () => apiRef.current?.getPosition() ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <fieldset className="mb-3">
          <legend className="text-sm font-medium">{labels.modeLabel}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" aria-pressed={mode.kind === "look"} onClick={() => setMode({ kind: "look" })} className={`${BUTTON} aria-pressed:bg-slate-900 aria-pressed:text-white`}>
              {labels.modeNone}
            </button>
            <button type="button" aria-pressed={mode.kind === "hotspot"} onClick={() => setMode({ kind: "hotspot" })} className={`${BUTTON} aria-pressed:bg-slate-900 aria-pressed:text-white`}>
              {labels.modeHotspot}
            </button>
            {mode.kind === "arrow" ? (
              <span className="inline-flex min-h-11 items-center rounded-lg bg-amber-100 px-3 text-sm font-semibold text-amber-950">
                {labels.modeArrow.replace("{room}", mode.room)}
              </span>
            ) : null}
          </div>
        </fieldset>
        <div className={`overflow-hidden rounded-xl ${mode.kind === "look" ? "" : "ring-4 ring-amber-400"}`} style={{ height: "min(70vh, 640px)" }}>
          {tour ? (
            <Tour
              tour={tour}
              labels={viewerLabels}
              height="100%"
              apiRef={apiRef}
              pinColor={pinColor}
              onPositionClick={onPositionClick}
              onSceneChange={(next) => {
                // Walked through an arrow: edit that room next.
                if (next !== sceneId) router.push(`${editorBase}/${next}`);
              }}
            />
          ) : null}
        </div>
        {mode.kind !== "look" ? <p className="mt-2 text-sm font-medium">{labels.clickToPlace}</p> : null}
        <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm">
          {status}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const p = position();
              if (p) void run(() => updateSceneAction(sceneId, { startView: p }), labels.startViewSet);
            }}
            className={BUTTON}
          >
            {labels.startView}
          </button>
          {incoming.map((link) => (
            <span key={link.id} className="inline-flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const p = position();
                  if (p) void run(() => updateLinkAction(link.id, { kind: "arrival", ...p }), labels.saved);
                }}
                className={BUTTON}
              >
                {labels.arrival.replace("{room}", link.otherName)}
              </button>
              {link.hasArrival ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => updateLinkAction(link.id, { kind: "arrival", yaw: null, pitch: null }), labels.saved)}
                  className={BUTTON}
                >
                  {labels.arrivalClear}
                  <span className="sr-only">: {link.otherName}</span>
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run(
              () => updateSceneAction(sceneId, { name: String(data.get("name") ?? ""), caption: String(data.get("caption") ?? "") || null }),
              labels.saved,
            );
          }}
        >
          <label htmlFor={ids.name} className="text-sm font-medium">
            {labels.name}
            <input id={ids.name} name="name" defaultValue={initial.name} maxLength={80} required className={FIELD} />
          </label>
          <label htmlFor={ids.caption} className="text-sm font-medium">
            {labels.caption}
            <input id={ids.caption} name="caption" defaultValue={initial.caption ?? ""} maxLength={200} className={FIELD} />
          </label>
          <button type="submit" disabled={busy} className={BUTTON}>
            {labels.save}
          </button>
        </form>

        <section aria-labelledby="doorways-title">
          <h3 id="doorways-title" className="font-semibold">
            {labels.doorways}
          </h3>
          {outgoing.length === 0 ? (
            <p className="mt-1 text-sm">{labels.noDoorways}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {outgoing.map((link) => (
                <li key={link.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-medium">
                    → {link.otherName}{" "}
                    <span className={link.placed ? "text-sm text-slate-600" : "text-sm font-semibold text-amber-800"}>
                      ({link.placed ? labels.placed : labels.unplaced})
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMode({ kind: "arrow", linkId: link.id, room: link.otherName })}
                      aria-pressed={mode.kind === "arrow" && mode.linkId === link.id}
                      className={`${BUTTON} aria-pressed:bg-amber-200`}
                    >
                      {labels.modeArrow.replace("{room}", link.otherName)}
                    </button>
                    <button type="button" disabled={busy || !link.placed} onClick={() => void run(() => updateLinkAction(link.id, { kind: "rotate", delta: -15 }), labels.saved)} className={BUTTON}>
                      <span aria-hidden="true">↺</span>
                      <span className="sr-only">
                        {labels.rotateLeft}: {link.otherName}
                      </span>
                    </button>
                    <button type="button" disabled={busy || !link.placed} onClick={() => void run(() => updateLinkAction(link.id, { kind: "rotate", delta: 15 }), labels.saved)} className={BUTTON}>
                      <span aria-hidden="true">↻</span>
                      <span className="sr-only">
                        {labels.rotateRight}: {link.otherName}
                      </span>
                    </button>
                    {link.arrowRotation ? (
                      <span className="inline-flex min-h-11 items-center text-sm text-slate-600">
                        {labels.rotation.replace("{deg}", String(link.arrowRotation))}
                      </span>
                    ) : null}
                  </div>
                  <form
                    className="mt-2 flex items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = String(new FormData(event.currentTarget).get("doorway") ?? "");
                      void run(() => updateLinkAction(link.id, { kind: "name", name: value || null }), labels.saved);
                    }}
                  >
                    <label className="flex-1 text-sm font-medium">
                      {labels.doorwayName}
                      <input name="doorway" defaultValue={link.name ?? ""} maxLength={80} placeholder={labels.doorwayNameHint} className={FIELD} />
                    </label>
                    <button type="submit" disabled={busy} className={BUTTON}>
                      {labels.save}
                      <span className="sr-only">: {link.otherName}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="view-title" className="flex flex-col gap-3">
          <h3 id="view-title" className="font-semibold">
            {labels.saveView}
          </h3>
          <label htmlFor={ids.roll} className="text-sm font-medium">
            {labels.roll}: {roll}°
            <input
              id={ids.roll}
              type="range"
              min={-ROLL_LIMIT_DEG}
              max={ROLL_LIMIT_DEG}
              step={0.5}
              value={roll}
              aria-describedby={`${ids.roll}-hint`}
              onChange={(event) => {
                const value = Number(event.target.value);
                setRoll(value);
                apiRef.current?.setRoll(value);
              }}
              className="mt-2 block min-h-11 w-full"
            />
          </label>
          <p id={`${ids.roll}-hint`} className="text-xs text-slate-600 dark:text-slate-400">
            {labels.rollHint}
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={limitOn}
              onChange={(event) => {
                setLimitOn(event.target.checked);
                apiRef.current?.setMinPitch(event.target.checked ? limit : null);
              }}
              className="h-5 w-5"
            />
            {labels.viewLimitOn}
          </label>
          {limitOn ? (
            <>
              <label htmlFor={ids.limit} className="text-sm font-medium">
                {labels.viewLimit}: {limit}°
                <input
                  id={ids.limit}
                  type="range"
                  min={VIEW_LIMIT_MIN_DEG}
                  max={VIEW_LIMIT_MAX_DEG}
                  step={1}
                  value={limit}
                  aria-describedby={`${ids.limit}-hint`}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setLimit(value);
                    apiRef.current?.setMinPitch(value);
                  }}
                  className="mt-2 block min-h-11 w-full"
                />
              </label>
              <p id={`${ids.limit}-hint`} className="text-xs text-slate-600 dark:text-slate-400">
                {labels.viewLimitHint}
              </p>
            </>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => updateSceneAction(sceneId, { roll, viewLimit: limitOn ? limit : null }), labels.saved)}
            className={BUTTON}
          >
            {labels.saveView}
          </button>
        </section>

        <section aria-labelledby="hotspots-title" className="flex flex-col gap-3">
          <h3 id="hotspots-title" className="font-semibold">
            {labels.hotspots}
          </h3>
          {hotspots.length === 0 && !draft ? <p className="text-sm">{labels.noHotspots}</p> : null}
          <ul className="flex flex-col gap-2">
            {hotspots.map((hotspot) => (
              <li key={hotspot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                <span className="font-medium">{hotspot.title}</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setDraft({ ...hotspot })} className={BUTTON}>
                    {labels.editHotspot}
                    <span className="sr-only">: {hotspot.title}</span>
                  </button>
                  <button type="button" disabled={busy} onClick={() => void run(() => deleteHotspotAction(hotspot.id), labels.saved)} className={BUTTON}>
                    {labels.deleteHotspot}
                    <span className="sr-only">: {hotspot.title}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {draft ? (
            <form
              className="flex flex-col gap-3 rounded-lg border-2 border-amber-400 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const input = {
                  yaw: draft.yaw,
                  pitch: draft.pitch,
                  title: String(data.get("title") ?? ""),
                  content: String(data.get("content") ?? "") || null,
                  externalUrl: String(data.get("url") ?? "") || null,
                  momentId: String(data.get("moment") ?? "") || null,
                };
                void run(async () => {
                  const result = await saveHotspotAction(sceneId, draft.id, input);
                  if (result.ok) setDraft(null);
                  return result;
                }, labels.saved);
              }}
            >
              <label className="text-sm font-medium">
                {labels.hotspotTitle}
                <input name="title" defaultValue={draft.title} maxLength={80} required className={FIELD} />
              </label>
              <label className="text-sm font-medium">
                {labels.hotspotContent}
                <textarea name="content" defaultValue={draft.content ?? ""} maxLength={1000} rows={3} className={FIELD} />
              </label>
              <label className="text-sm font-medium">
                {labels.hotspotUrl}
                <input name="url" type="url" defaultValue={draft.externalUrl ?? ""} maxLength={500} className={FIELD} />
              </label>
              {moments.length ? (
                <label className="text-sm font-medium">
                  {labels.hotspotMoment}
                  <select name="moment" defaultValue={draft.momentId ?? ""} className={FIELD}>
                    <option value="">{labels.hotspotEveryMoment}</option>
                    {moments.map((moment) => (
                      <option key={moment.id} value={moment.id}>
                        {moment.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className={BUTTON}>
                  {labels.saveHotspot}
                </button>
                <button type="button" onClick={() => setDraft(null)} className={BUTTON}>
                  {labels.cancel}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
