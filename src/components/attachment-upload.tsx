"use client";

import { useState } from "react";

// Screenshot attachment for support threads: signed Cloudinary upload, then
// the resulting mediaId rides the surrounding server-action form via a
// hidden input. The form still submits fine with no screenshot (progressive).

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

export function AttachmentUpload({
  name,
  labels,
}: {
  /** Hidden input name carrying the uploaded mediaId. */
  name: string;
  labels: { field: string; upload: string; uploading: string; done: string; failed: string };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mediaId, setMediaId] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

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
          // Screenshots are functional evidence; a fixed descriptive alt is
          // honest (nothing decorative or misleading).
          altText: "Support screenshot",
        }),
      });
      const registered = (await complete.json()) as { ok: boolean; data?: { mediaId: string } };
      if (!registered.ok || !registered.data) throw new Error("register");
      setMediaId(registered.data.mediaId);
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={mediaId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        {labels.field}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setMediaId("");
            setState("idle");
          }}
          className="min-h-11 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={upload}
        disabled={!file || state === "busy" || state === "done"}
        className="inline-flex min-h-11 w-fit items-center rounded-full border border-slate-300 px-5 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
      >
        {state === "busy" ? labels.uploading : labels.upload}
      </button>
      <p role="status" aria-live="polite" className="text-xs text-slate-500">
        {state === "done" ? labels.done : state === "failed" ? labels.failed : ""}
      </p>
    </div>
  );
}
