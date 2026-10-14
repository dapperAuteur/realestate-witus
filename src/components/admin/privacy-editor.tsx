"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { applyPrivacyEditAction } from "@/app/[lang]/admin/listings/actions";
import { paintNadirPatch } from "@/lib/tour/nadir-patch";
import {
  BUILTIN_LOGOS,
  DEFAULT_PATCH_COLOR,
  PRIVACY_BOTTOM_MAX_DEG,
  PRIVACY_BOTTOM_MIN_DEG,
  PRIVACY_DEFAULT_BOX,
  PRIVACY_MAX_BOXES,
  PRIVACY_MAX_BOX_W,
  PRIVACY_MIN_BOX,
  boxRects,
  emptyPrivacyRecipe,
  privacyTransformation,
  type BuiltinLogo,
  type PrivacyBox,
  type PrivacyPatch,
  type PrivacyRecipe,
} from "@/lib/tour/privacy-edit";
import { LogoUploader, type UploadLabels } from "./uploaders";

// "Hide people and gear" (plans/08 phase D), on a flat 2:1 view of the
// original 360 photo: what Cloudinary's region effects measure. Drag to draw
// a box; every box is a button the arrow keys move (Shift resizes), so the
// keyboard path does everything the pointer does. The preview is Cloudinary
// rendering the exact effects that will be baked, with the floor patch (painted
// here, in the browser) laid over it the way Cloudinary will lay it.

type Labels = Record<string, string>;

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Without this the canvas is tainted and can't be read back. Cloudinary
    // answers with Access-Control-Allow-Origin: *.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo"));
    img.src = url;
  });
}
let nextId = 0;
const newId = () => `b${Date.now().toString(36)}${(nextId++).toString(36)}`;

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} className="h-5 w-5" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PrivacyEditor({
  sceneId,
  momentId = null,
  currentMediaId,
  source,
  previewBase,
  initialRecipe,
  edited,
  backHref,
  labels,
  logos = [],
  builtinLogos = [],
  uploadLabels,
}: {
  sceneId: string;
  /** Editing the room's photo for this time (Before / After) instead of its current photo. */
  momentId?: string | null;
  currentMediaId: string;
  /** The untouched original: its public id and pixel size (regions are written in its pixels). */
  source: { publicId: string; width: number | null; height: number | null };
  /** `https://res.cloudinary.com/<cloud>/image/upload/` */
  previewBase: string;
  initialRecipe: PrivacyRecipe | null;
  /** The room currently shows an edited copy. */
  edited: boolean;
  backHref: string;
  labels: Labels;
  /** The agency's uploaded logos, for the floor patch. */
  logos?: { id: string; url: string }[];
  /** The app's own logos this tenant may use (BAM's listings, the demo): offered first, and the default. */
  builtinLogos?: { key: BuiltinLogo; label: string }[];
  uploadLabels: UploadLabels;
}) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<PrivacyRecipe>(initialRecipe ?? emptyPrivacyRecipe());
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<{ u0: number; v0: number; u1: number; v1: number } | null>(null);
  const [patchUrl, setPatchUrl] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef(new Map<string, HTMLButtonElement>());

  const defaultPatch: PrivacyPatch = {
    color: DEFAULT_PATCH_COLOR,
    logoMediaId: null,
    ...(builtinLogos[0] ? { builtinLogo: builtinLogos[0].key } : {}),
  };
  const patch = recipe.bottom.patch ?? defaultPatch;
  const logoUrl = patch.builtinLogo
    ? BUILTIN_LOGOS[patch.builtinLogo]
    : patch.logoMediaId
      ? (logos.find((logo) => logo.id === patch.logoMediaId)?.url ?? null)
      : null;
  const patching = recipe.bottom.mode === "patch";

  // Repaint the patch whenever what it shows changes. Cheap: a 2048 px strip.
  useEffect(() => {
    if (!patching) {
      setPatchUrl(null);
      return;
    }
    let live = true;
    void (async () => {
      const logo = logoUrl ? await loadImage(logoUrl).catch(() => null) : null;
      if (!live) return;
      if (logoUrl && !logo) setStatus(labels.logoFailed);
      setPatchUrl(paintNadirPatch({ color: patch.color, angleDeg: recipe.bottom.angleDeg, logo }));
    })();
    return () => {
      live = false;
    };
  }, [patching, patch.color, logoUrl, recipe.bottom.angleDeg, labels.logoFailed]);

  const setPatch = (change: Partial<PrivacyPatch>) =>
    setRecipe((r) => ({ ...r, bottom: { ...r.bottom, patch: { ...patch, ...change } } }));

  const size = source.width && source.height ? { width: source.width, height: source.height } : undefined;
  const plain = `${previewBase}c_limit,w_1600/f_auto,q_auto/${source.publicId}`;
  const effects = privacyTransformation(recipe, { imageSize: size });
  const previewSrc = effects.length ? `${previewBase}${effects.join("/")}/c_limit,w_1600/f_auto,q_auto/${source.publicId}` : plain;

  const setBoxes = (boxes: PrivacyBox[]) => setRecipe((r) => ({ ...r, boxes }));
  const update = (id: string, change: (box: PrivacyBox) => PrivacyBox) =>
    setRecipe((r) => ({ ...r, boxes: r.boxes.map((box) => (box.id === id ? change(box) : box)) }));

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = areaRef.current!.getBoundingClientRect();
    return { u: clamp((event.clientX - rect.left) / rect.width, 0, 1), v: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };

  function addBox(at?: { u: number; v: number }, size?: { w: number; h: number }) {
    if (recipe.boxes.length >= PRIVACY_MAX_BOXES) {
      setStatus(labels.tooMany);
      return;
    }
    const box: PrivacyBox = {
      id: newId(),
      u: at?.u ?? 0.5,
      v: at?.v ?? 0.5,
      w: clamp(size?.w ?? PRIVACY_DEFAULT_BOX.w, PRIVACY_MIN_BOX, PRIVACY_MAX_BOX_W),
      h: clamp(size?.h ?? PRIVACY_DEFAULT_BOX.h, PRIVACY_MIN_BOX, 1),
    };
    setBoxes([...recipe.boxes, box]);
    setSelected(box.id);
    // Focus the new box, so the keyboard can move it straight away.
    requestAnimationFrame(() => boxRefs.current.get(box.id)?.focus());
  }

  function onBoxKey(event: KeyboardEvent<HTMLButtonElement>, box: PrivacyBox) {
    const step = event.altKey ? 0.002 : 0.01;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      setBoxes(recipe.boxes.filter((b) => b.id !== box.id));
      setSelected(null);
      return;
    }
    if (!dx && !dy) return;
    event.preventDefault();
    update(box.id, (b) =>
      event.shiftKey
        ? { ...b, w: clamp(b.w + dx, PRIVACY_MIN_BOX, PRIVACY_MAX_BOX_W), h: clamp(b.h + dy, PRIVACY_MIN_BOX, 1) }
        : // Across the left or right edge a box wraps, like the room does.
          { ...b, u: (((b.u + dx) % 1) + 1) % 1, v: clamp(b.v + dy, 0, 1) },
    );
  }

  async function save(next: PrivacyRecipe, done: string, removeOriginal = false) {
    if (next.bottom.mode === "patch" && !patchUrl) {
      setStatus(labels.patchNotReady);
      return;
    }
    setBusy(true);
    setStatus(labels.working);
    const result = await applyPrivacyEditAction(sceneId, currentMediaId, next, momentId, {
      deleteOriginal: removeOriginal,
      patchDataUrl: next.bottom.mode === "patch" ? patchUrl : null,
    });
    setBusy(false);
    setStatus(result.ok ? (removeOriginal ? labels.appliedDeleted : done) : result.error);
    if (!result.ok) return;
    if (removeOriginal) {
      // The edited copy is the photo now, and its edits are baked in: start clean.
      setRecipe(emptyPrivacyRecipe());
      setDeleteOriginal(false);
      setSelected(null);
    }
    router.refresh();
  }

  const coverTop = 1 - recipe.bottom.angleDeg / 180;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">{labels.drawHint}</p>
        <div
          ref={areaRef}
          className="relative aspect-[2/1] w-full touch-none select-none overflow-hidden rounded-xl bg-slate-200"
          onPointerDown={(event) => {
            if (preview || event.target !== event.currentTarget) return;
            const p = pointAt(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraft({ u0: p.u, v0: p.v, u1: p.u, v1: p.v });
          }}
          onPointerMove={(event) => {
            if (!draft) return;
            const p = pointAt(event);
            setDraft({ ...draft, u1: p.u, v1: p.v });
          }}
          onPointerUp={() => {
            if (!draft) return;
            const w = Math.abs(draft.u1 - draft.u0);
            const h = Math.abs(draft.v1 - draft.v0);
            const tiny = w < PRIVACY_MIN_BOX * 2 && h < PRIVACY_MIN_BOX * 2;
            // A click without a drag drops a person-sized box there.
            addBox({ u: (draft.u0 + draft.u1) / 2, v: (draft.v0 + draft.v1) / 2 }, tiny ? undefined : { w, h });
            setDraft(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview ? previewSrc : plain}
            alt={preview ? labels.previewAlt : labels.originalAlt}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          {preview && patching && patchUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={patchUrl}
              alt=""
              className="pointer-events-none absolute inset-x-0 bottom-0 w-full"
              style={{ top: `${coverTop * 100}%`, height: `${(1 - coverTop) * 100}%` }}
            />
          ) : null}
          {!preview ? (
            <>
              {recipe.bottom.mode !== "off" ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 border-t-2 border-dashed border-amber-400 bg-amber-300/20"
                  style={{ top: `${coverTop * 100}%` }}
                />
              ) : null}
              {recipe.boxes.map((box, i) =>
                boxRects(box).map((rect, part) => (
                  <button
                    key={`${box.id}-${part}`}
                    ref={part === 0 ? (el) => void (el ? boxRefs.current.set(box.id, el) : boxRefs.current.delete(box.id)) : undefined}
                    type="button"
                    tabIndex={part === 0 ? 0 : -1}
                    aria-hidden={part === 0 ? undefined : true}
                    aria-label={labels.boxN.replace("{n}", String(i + 1))}
                    aria-pressed={selected === box.id}
                    onClick={() => setSelected(box.id)}
                    onKeyDown={(event) => onBoxKey(event, box)}
                    className={`absolute border-2 border-dashed ${selected === box.id ? "border-amber-400 bg-amber-300/30" : "border-white bg-white/10"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900`}
                    style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
                  />
                )),
              )}
              {draft ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/30"
                  style={{
                    left: `${Math.min(draft.u0, draft.u1) * 100}%`,
                    top: `${Math.min(draft.v0, draft.v1) * 100}%`,
                    width: `${Math.abs(draft.u1 - draft.u0) * 100}%`,
                    height: `${Math.abs(draft.v1 - draft.v0) * 100}%`,
                  }}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{labels.keyboardHint}</p>
        <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm font-medium">
          {status}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Choice
          legend={labels.faces}
          value={recipe.faces}
          options={[
            { value: "off", label: labels.off },
            { value: "blur", label: labels.blur },
            { value: "pixelate", label: labels.pixelate },
          ]}
          onChange={(faces) => setRecipe((r) => ({ ...r, faces }))}
        />
        <p className="-mt-3 text-xs text-slate-600 dark:text-slate-400">{labels.facesHint}</p>

        <div className="flex flex-col gap-2">
          <Choice
            legend={labels.boxes}
            value={recipe.boxStyle}
            options={[
              { value: "pixelate", label: labels.pixelate },
              { value: "blur", label: labels.blur },
            ]}
            onChange={(boxStyle) => setRecipe((r) => ({ ...r, boxStyle }))}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addBox()} disabled={preview} className={BUTTON}>
              {labels.addBox}
            </button>
            {selected ? (
              <button
                type="button"
                onClick={() => {
                  setBoxes(recipe.boxes.filter((b) => b.id !== selected));
                  setSelected(null);
                }}
                className={BUTTON}
              >
                {labels.removeBox}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">{labels.boxCount.replace("{n}", String(recipe.boxes.length))}</p>
        </div>

        <Choice
          legend={labels.floor}
          value={recipe.bottom.mode}
          options={[
            { value: "off", label: labels.off },
            { value: "blur", label: labels.blur },
            { value: "pixelate", label: labels.pixelate },
            { value: "patch", label: labels.patch },
          ]}
          onChange={(mode) =>
            // A patch always carries its details, so the server never gets a patch without them.
            setRecipe((r) => ({ ...r, bottom: { ...r.bottom, mode, ...(mode === "patch" && !r.bottom.patch ? { patch: defaultPatch } : {}) } }))
          }
        />
        {recipe.bottom.mode !== "off" ? (
          <label className="text-sm font-medium">
            {labels.floorHeight.replace("{deg}", String(recipe.bottom.angleDeg))}
            <input
              type="range"
              min={PRIVACY_BOTTOM_MIN_DEG}
              max={PRIVACY_BOTTOM_MAX_DEG}
              value={recipe.bottom.angleDeg}
              onChange={(event) => setRecipe((r) => ({ ...r, bottom: { ...r.bottom, angleDeg: Number(event.target.value) } }))}
              className="mt-2 block min-h-11 w-full"
            />
          </label>
        ) : null}
        {patching ? (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-400">{labels.patchHint}</p>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="color"
                value={patch.color}
                onChange={(event) => setPatch({ color: event.target.value })}
                className="h-11 w-16 cursor-pointer rounded border border-slate-300 dark:border-slate-700"
              />
              {labels.patchColor}
            </label>
            <fieldset>
              <legend className="text-sm font-medium">{labels.patchLogo}</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="patch-logo"
                    checked={!patch.logoMediaId && !patch.builtinLogo}
                    onChange={() => setPatch({ logoMediaId: null, builtinLogo: undefined })}
                    className="h-5 w-5"
                  />
                  {labels.noLogo}
                </label>
                {builtinLogos.map((logo) => (
                  <label key={logo.key} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="patch-logo"
                      checked={patch.builtinLogo === logo.key}
                      onChange={() => setPatch({ logoMediaId: null, builtinLogo: logo.key })}
                      className="h-5 w-5"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={BUILTIN_LOGOS[logo.key]} alt="" className="h-10 w-10 rounded bg-slate-800 object-contain p-1" />
                    {logo.label}
                  </label>
                ))}
                {logos.map((logo, i) => (
                  <label key={logo.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="patch-logo"
                      checked={patch.logoMediaId === logo.id}
                      onChange={() => setPatch({ logoMediaId: logo.id, builtinLogo: undefined })}
                      className="h-5 w-5"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.url} alt="" className="h-10 w-16 rounded bg-slate-200 object-contain p-1 dark:bg-slate-700" />
                    <span className="sr-only">{labels.logoN.replace("{n}", String(i + 1))}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <LogoUploader labels={uploadLabels} onUploaded={(mediaId) => setPatch({ logoMediaId: mediaId, builtinLogo: undefined })} />
          </div>
        ) : null}

        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} className="h-5 w-5" />
          {labels.preview}
        </label>

        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={deleteOriginal}
              onChange={(event) => setDeleteOriginal(event.target.checked)}
              aria-describedby="privacy-delete-hint"
              className="h-5 w-5"
            />
            {labels.deleteOriginal}
          </label>
          <p id="privacy-delete-hint" className="text-xs text-slate-600 dark:text-slate-400">
            {labels.deleteOriginalHint}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(recipe, labels.applied, deleteOriginal)}
            className={`${BUTTON} border-0 text-white`}
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {labels.apply}
          </button>
          {edited ? (
            <button type="button" disabled={busy} onClick={() => void save(emptyPrivacyRecipe(), labels.restored)} className={BUTTON}>
              {labels.restore}
            </button>
          ) : null}
          <a href={backHref} className={BUTTON}>
            {labels.back}
          </a>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">{labels.keepsOriginal}</p>
      </div>
    </div>
  );
}
