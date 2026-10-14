"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { importTourCsvAction } from "@/app/[lang]/admin/listings/actions";
import { CopyButton } from "@/components/copy-button";
import type en from "@/dictionaries/en.json";
import {
  CSV_MAX_CHARS,
  CSV_TEMPLATE,
  formatCsvIssue,
  parseTourCsv,
  planImport,
  type TourCsvContext,
} from "@/lib/tour/csv-import";
import { ACCENT, HINT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./listing-form";
import { PICKER, Picker, UploadList, useBatchUpload, type UploadLabels } from "./uploaders";

// Build the tour from a spreadsheet (plans/06). Nothing is uploaded or saved
// until the preview is clean and the editor presses Import; the server then
// checks it all again against the listing as it is by then. Photos upload once
// per pick: importing again, or retrying after a failed upload, reuses them.

export type CsvImportLabels = (typeof en)["admin"]["tour"]["csv"];

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

export function TourCsvImport({
  listingId,
  context,
  labels,
  uploadLabels,
}: {
  listingId: string;
  context: TourCsvContext;
  labels: CsvImportLabels;
  uploadLabels: UploadLabels;
}) {
  const router = useRouter();
  const csvId = useId();
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [replacePhotos, setReplacePhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);
  const [status, setStatus] = useState("");
  const uploaded = useRef(new Map<File, string>());
  const upload = useBatchUpload("panorama", uploadLabels);

  const parsed = useMemo(() => (csv ? parseTourCsv(csv.text, context) : null), [csv, context]);
  const plan = useMemo(
    () => (parsed ? planImport(parsed, context, files.map((f) => f.name), { replacePhotos }) : null),
    [parsed, context, files, replacePhotos],
  );
  const issues = parsed && plan ? [...parsed.issues, ...plan.issues] : [];
  const canImport = Boolean(plan) && issues.length === 0 && !busy;

  async function runImport() {
    if (!plan || !csv) return;
    setBusy(true);
    setStatus("");
    const wanted = plan.uploads
      .map((name) => files.find((f) => f.name.toLowerCase() === name.toLowerCase()))
      .filter((f): f is File => Boolean(f) && !uploaded.current.has(f as File));
    if (wanted.length) {
      const done = await upload.run(wanted);
      for (const item of done) {
        const file = wanted.find((f) => f.name === item.filename);
        if (file) uploaded.current.set(file, item.mediaId);
      }
      if (done.length < wanted.length) {
        setBusy(false);
        setStatus(labels.uploadsFailed);
        return;
      }
    }
    setStatus(labels.importing);
    const photos = files
      .filter((f) => uploaded.current.has(f))
      .map((f) => ({ filename: f.name, mediaId: uploaded.current.get(f)! }));
    const result = await importTourCsvAction(listingId, csv.text, photos, replacePhotos);
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setImported(true);
    setStatus(
      labels.done
        .replace("{created}", String(result.data.created))
        .replace("{updated}", String(result.data.updated))
        .replace("{connected}", String(result.data.connected)),
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{labels.stepsTitle}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm">
          {labels.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-sm font-semibold">{labels.columnsTitle}</p>
        <ul className="mt-1 list-disc space-y-1 pl-6 text-sm">
          {labels.columns.map((column) => (
            <li key={column}>{column}</li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap items-start gap-3">
        <a href={TEMPLATE_HREF} download="tour-template.csv" className={SECONDARY_BUTTON}>
          {labels.download}
        </a>
        <CopyButton value={CSV_TEMPLATE} label={labels.copyLabel} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div>
          <label htmlFor={csvId} className={PICKER} aria-disabled={busy}>
            {labels.chooseCsv}
            <input
              id={csvId}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              className="sr-only"
              aria-describedby={`${csvId}-hint`}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                // Anything this big isn't a room list (most likely a photo picked by mistake).
                const text = file.size > CSV_MAX_CHARS * 4 ? "" : await file.text();
                setCsv({ name: file.name, text });
                setImported(false);
                setStatus("");
              }}
            />
          </label>
          <p id={`${csvId}-hint`} className={HINT}>
            {csv ? labels.csvPicked.replace("{name}", csv.name) : labels.csvHint}
          </p>
        </div>
        <div>
          <Picker
            labels={{ ...uploadLabels, choose: labels.choosePhotos, hint: labels.photosHint }}
            multiple
            disabled={busy}
            onFiles={(picked) => {
              setFiles(picked);
              setImported(false);
            }}
          />
          {files.length ? <p className={HINT}>{labels.photosPicked.replace("{n}", String(files.length))}</p> : null}
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={replacePhotos}
          disabled={busy}
          onChange={(event) => setReplacePhotos(event.currentTarget.checked)}
          className="h-5 w-5"
        />
        {labels.replacePhotos}
      </label>

      {plan ? (
        <div aria-live="polite" className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h4 className="font-semibold">{labels.previewTitle}</h4>
          {issues.length ? (
            <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
              <p className="font-semibold">{labels.problemsTitle}</p>
              <ul className="mt-1 list-disc space-y-1 pl-6 text-sm">
                {issues.map((item, i) => (
                  <li key={`${item.code}-${item.line}-${i}`}>{formatCsvIssue(item, labels.issues)}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-3 text-sm">
              {plan.create.length ? (
                <div>
                  <p className="font-medium">{labels.toAdd.replace("{n}", String(plan.create.length))}</p>
                  <ul className="mt-1 list-disc pl-6">
                    {plan.create.map((room) => (
                      <li key={room.line}>
                        {room.name}
                        <span className="text-slate-600 dark:text-slate-400">
                          {" "}
                          ({room.photo}
                          {room.floor ? `, ${labels.onFloor.replace("{floor}", room.floor)}` : ""})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan.update.length ? (
                <div>
                  <p className="font-medium">{labels.toUpdate.replace("{n}", String(plan.update.length))}</p>
                  <ul className="mt-1 list-disc pl-6">
                    {plan.update.map((room) => (
                      <li key={room.line}>
                        {room.name}
                        <span className="text-slate-600 dark:text-slate-400">
                          {" "}
                          ({room.photo && plan.uploads.some((name) => name.toLowerCase() === room.photo!.toLowerCase()) ? labels.newPhoto : labels.keepsPhoto}
                          {room.floor ? `, ${labels.onFloor.replace("{floor}", room.floor)}` : ""})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan.links.length ? (
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center font-medium">
                    {labels.toConnect.replace("{n}", String(plan.links.length))}
                  </summary>
                  <ul className="mt-1 list-disc pl-6">
                    {plan.links.map(([a, b]) => (
                      <li key={`${a}|${b}`}>{labels.pair.replace("{a}", a).replace("{b}", b)}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {plan.start ? <p>{labels.start.replace("{name}", plan.start)}</p> : null}
              {plan.unusedFiles.length ? (
                <p className="text-slate-600 dark:text-slate-400">{labels.unused.replace("{names}", plan.unusedFiles.join(", "))}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runImport}
          disabled={!canImport}
          className={`${imported ? SECONDARY_BUTTON : PRIMARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-60`}
          style={imported ? undefined : ACCENT}
        >
          {imported ? labels.importAgain : labels.import}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-slate-700 dark:text-slate-300">
          {status || upload.note}
        </p>
      </div>
      <UploadList rows={upload.rows} labels={uploadLabels} />
    </div>
  );
}
