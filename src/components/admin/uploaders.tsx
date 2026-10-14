"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  addFloorPlanAction,
  attachPhotosAction,
  createScenesAction,
} from "@/app/[lang]/admin/listings/actions";

// Signed Cloudinary uploads for the listing admin (plans/08 phase D). The
// browser gets a short-lived signature, uploads straight to Cloudinary (the
// API secret never leaves the server), then registers the file with its kind.
// Files over 20 MB go up in 6 MB chunks: 360 photos from an X5 run 20 to 40
// MB, and one 3G hiccup should cost a chunk, not the whole file.

export type UploadKind = "photo" | "panorama" | "floor_plan";

export type UploadLabels = {
  choose: string;
  uploading: string;
  done: string;
  failed: string;
  notConfigured: string;
  hint: string;
};

const CHUNK_THRESHOLD = 20 * 1024 * 1024;
const CHUNK_SIZE = 6 * 1024 * 1024;

interface Signed {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; code: string; error: string };

async function sign(): Promise<Envelope<Signed>> {
  const res = await fetch("/api/media/sign", { method: "POST" });
  return ((await res.json().catch(() => null)) as Envelope<Signed> | null) ?? {
    ok: false,
    code: "SIGN_FAILED",
    error: "Upload signing failed.",
  };
}

async function sendToCloudinary(file: File, signed: Signed) {
  const url = `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`;
  const form = (part: Blob) => {
    const data = new FormData();
    data.set("file", part, file.name);
    data.set("api_key", signed.apiKey);
    data.set("timestamp", String(signed.timestamp));
    data.set("folder", signed.folder);
    data.set("signature", signed.signature);
    return data;
  };
  type Uploaded = { public_id?: string; width?: number; height?: number; bytes?: number; error?: { message?: string } };
  if (file.size <= CHUNK_THRESHOLD) {
    const res = await fetch(url, { method: "POST", body: form(file) });
    return (await res.json()) as Uploaded;
  }
  const uploadId = crypto.randomUUID();
  let last: Uploaded = {};
  for (let start = 0; start < file.size; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const res = await fetch(url, {
      method: "POST",
      body: form(file.slice(start, end)),
      headers: { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${file.size}` },
    });
    last = (await res.json()) as Uploaded;
    if (!res.ok) break;
  }
  return last;
}

/** Uploads one file and registers it; returns the media id or a readable reason. */
async function uploadOne(file: File, kind: UploadKind): Promise<Envelope<{ mediaId: string }>> {
  const signed = await sign();
  if (!signed.ok) return signed;
  const uploaded = await sendToCloudinary(file, signed.data).catch(() => null);
  if (!uploaded?.public_id) {
    return { ok: false, code: "UPLOAD_FAILED", error: uploaded?.error?.message ?? "The upload didn't finish." };
  }
  const res = await fetch("/api/media/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicId: uploaded.public_id,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      kind,
      // Alt text is written after upload, in the list (a11y rule: meaningful or deliberately empty).
      altText: "",
    }),
  });
  return ((await res.json().catch(() => null)) as Envelope<{ mediaId: string }> | null) ?? {
    ok: false,
    code: "REGISTER_FAILED",
    error: "The file uploaded but couldn't be registered.",
  };
}

type Row = { name: string; state: "waiting" | "uploading" | "done" | "failed"; reason?: string };

function useBatchUpload(kind: UploadKind, labels: UploadLabels) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function run(files: File[]): Promise<{ mediaId: string; filename: string }[]> {
    setBusy(true);
    setNote("");
    setRows(files.map((file) => ({ name: file.name, state: "waiting" })));
    const done: { mediaId: string; filename: string }[] = [];
    for (const [i, file] of files.entries()) {
      setRows((prev) => prev.map((row, j) => (j === i ? { ...row, state: "uploading" } : row)));
      setNote(labels.uploading.replace("{n}", String(i + 1)).replace("{total}", String(files.length)));
      const result = await uploadOne(file, kind);
      if (result.ok) done.push({ mediaId: result.data.mediaId, filename: file.name });
      setRows((prev) =>
        prev.map((row, j) =>
          j === i
            ? result.ok
              ? { ...row, state: "done" }
              : { ...row, state: "failed", reason: result.code === "MEDIA_NOT_CONFIGURED" ? labels.notConfigured : result.error }
            : row,
        ),
      );
    }
    setBusy(false);
    return done;
  }
  return { rows, busy, note, setNote, run };
}

function UploadList({ rows, labels }: { rows: Row[]; labels: UploadLabels }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {rows.map((row, i) => (
        <li key={`${row.name}-${i}`} className="flex flex-wrap gap-x-2">
          <span className="font-medium">{row.name}</span>
          <span className={row.state === "failed" ? "text-red-700" : "text-slate-600"}>
            {row.state === "done"
              ? labels.done
              : row.state === "failed"
                ? labels.failed.replace("{reason}", row.reason ?? "")
                : row.state === "uploading"
                  ? "…"
                  : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const PICKER =
  "inline-flex min-h-11 cursor-pointer items-center rounded-lg border-2 border-dashed border-slate-400 px-4 font-semibold hover:border-slate-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-900";

function Picker({
  labels,
  multiple,
  disabled,
  onFiles,
}: {
  labels: UploadLabels;
  multiple: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={PICKER} aria-disabled={disabled}>
        {labels.choose}
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) onFiles(files);
          }}
        />
      </label>
      <p id={`${id}-hint`} className="mt-1 text-sm text-slate-600">
        {labels.hint}
      </p>
    </div>
  );
}

/** Listing photos: upload many, attach in the order chosen. */
export function PhotoUploader({ listingId, labels }: { listingId: string; labels: UploadLabels }) {
  const router = useRouter();
  const upload = useBatchUpload("photo", labels);
  return (
    <div>
      <Picker
        labels={labels}
        multiple
        disabled={upload.busy}
        onFiles={async (files) => {
          const done = await upload.run(files);
          if (done.length) await attachPhotosAction(listingId, done.map((item) => item.mediaId));
          router.refresh();
        }}
      />
      <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-700">
        {upload.note}
      </p>
      <UploadList rows={upload.rows} labels={labels} />
    </div>
  );
}

/** 360 photos: each becomes a draft room named from its file. */
export function PanoramaUploader({ listingId, labels }: { listingId: string; labels: UploadLabels }) {
  const router = useRouter();
  const upload = useBatchUpload("panorama", labels);
  return (
    <div>
      <Picker
        labels={labels}
        multiple
        disabled={upload.busy}
        onFiles={async (files) => {
          const done = await upload.run(files);
          if (done.length) {
            const result = await createScenesAction(listingId, done);
            if (!result.ok) upload.setNote(result.error);
          }
          router.refresh();
        }}
      />
      <p role="status" aria-live="polite" className="mt-2 text-sm text-slate-700">
        {upload.note}
      </p>
      <UploadList rows={upload.rows} labels={labels} />
    </div>
  );
}

/** One floor plan image plus its floor's name. */
export function FloorPlanUploader({
  listingId,
  labels,
  floorLabel,
  defaultLabel,
}: {
  listingId: string;
  labels: UploadLabels;
  floorLabel: string;
  defaultLabel: string;
}) {
  const router = useRouter();
  const upload = useBatchUpload("floor_plan", labels);
  const [label, setLabel] = useState(defaultLabel);
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {floorLabel}
        <input
          id={id}
          value={label}
          maxLength={40}
          onChange={(event) => setLabel(event.target.value)}
          className="mt-1 block min-h-11 w-full max-w-xs rounded-lg border border-slate-300 px-3"
        />
      </label>
      <Picker
        labels={labels}
        multiple={false}
        disabled={upload.busy || !label.trim()}
        onFiles={async (files) => {
          const done = await upload.run(files.slice(0, 1));
          if (done[0]) {
            const result = await addFloorPlanAction(listingId, done[0].mediaId, label);
            if (!result.ok) upload.setNote(result.error);
          }
          router.refresh();
        }}
      />
      <p role="status" aria-live="polite" className="text-sm text-slate-700">
        {upload.note}
      </p>
      <UploadList rows={upload.rows} labels={labels} />
    </div>
  );
}
