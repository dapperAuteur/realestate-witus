"use client";

import { useState } from "react";

// Signed Cloudinary upload (client leg): sign → direct upload → register.
// The API secret never leaves the server; this component only ever sees a
// one-time signature. Alt text is required before the button enables
// (a11y rule: meaningful or deliberately empty — "decorative" checkbox).

interface SignResponse {
  ok: boolean;
  data?: {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    folder: string;
    signature: string;
  };
}

export function PhotoUpload({
  roomTypeId,
  labels,
}: {
  roomTypeId: string;
  labels: { photoField: string; altField: string; decorative: string; upload: string; uploading: string; done: string; failed: string };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [decorative, setDecorative] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  const canUpload = Boolean(file) && (decorative || alt.trim().length > 0) && state !== "busy";

  async function upload() {
    if (!file) return;
    setState("busy");
    try {
      const signRes = await fetch("/api/media/sign", { method: "POST" });
      const sign = (await signRes.json()) as SignResponse;
      if (!sign.ok || !sign.data) throw new Error("sign");

      const form = new FormData();
      form.set("file", file);
      form.set("api_key", sign.data.apiKey);
      form.set("timestamp", String(sign.data.timestamp));
      form.set("folder", sign.data.folder);
      form.set("signature", sign.data.signature);
      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.data.cloudName}/image/upload`,
        { method: "POST", body: form },
      );
      const uploaded = (await upRes.json()) as {
        public_id?: string;
        width?: number;
        height?: number;
        bytes?: number;
      };
      if (!uploaded.public_id) throw new Error("upload");

      const complete = await fetch("/api/media/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicId: uploaded.public_id,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          altText: decorative ? "" : alt.trim(),
          roomTypeId,
        }),
      });
      if (!complete.ok) throw new Error("register");
      setState("done");
      // Server components re-read on navigation; a refresh shows the photo.
      window.location.reload();
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <label className="flex flex-col gap-1 text-xs font-medium">
        {labels.photoField}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="min-h-11 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        {labels.altField}
        <input
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          disabled={decorative}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
        />
      </label>
      <label className="inline-flex min-h-11 items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={decorative}
          onChange={(event) => setDecorative(event.target.checked)}
          className="h-4 w-4"
        />
        {labels.decorative}
      </label>
      <button
        type="button"
        onClick={upload}
        disabled={!canUpload}
        className="inline-flex min-h-11 w-fit items-center rounded-full border border-slate-300 px-5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700"
      >
        {state === "busy" ? labels.uploading : labels.upload}
      </button>
      <p role="status" aria-live="polite" className="text-xs text-slate-500">
        {state === "done" ? labels.done : state === "failed" ? labels.failed : ""}
      </p>
    </div>
  );
}
