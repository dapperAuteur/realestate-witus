import { createHash } from "node:crypto";
import { env } from "@/lib/env";

// Cloudinary foundation (wanderlearn pattern): SIGNED uploads only — the
// client gets a short-lived signature from /api/media/sign, never the API
// secret. Delivery URLs are built here, never by hand (ecosystem rule).
// Degrades cleanly while task 05 (Cloudinary account) is pending.

export const hasCloudinary = () =>
  Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );

/**
 * Cloudinary's signature scheme: SHA-1 over the alphabetically sorted
 * `key=value` params joined with `&`, with the API secret appended.
 * Exported for tests; callers use signUploadRequest.
 */
export function signParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/** Params the browser posts to Cloudinary's upload endpoint, tenant-foldered. */
export function signUploadRequest(tenantId: string): SignedUpload | null {
  if (!hasCloudinary()) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `realestate-witus/${tenantId}`;
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: env.CLOUDINARY_API_KEY as string,
    timestamp,
    folder,
    signature: signParams(
      { folder, timestamp },
      env.CLOUDINARY_API_SECRET as string,
    ),
  };
}

/** f_auto/q_auto delivery URL; width caps keep mobile pages light. */
export function deliveryUrl(
  publicId: string,
  opts: { width?: number } = {},
): string | null {
  if (!env.CLOUDINARY_CLOUD_NAME) return null;
  const transform = ["f_auto", "q_auto", opts.width ? `w_${opts.width}` : null]
    .filter(Boolean)
    .join(",");
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${transform}/${publicId}`;
}

/**
 * A width CAP, not a resize: c_limit never upscales, so a small image keeps
 * its own pixels. Used where delivered dimensions matter (floor-plan pins are
 * normalized against them) and for 360 panoramas, capped for phones.
 */
export function limitedUrl(publicId: string, width: number): string | null {
  if (!env.CLOUDINARY_CLOUD_NAME) return null;
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,c_limit,w_${width}/${publicId}`;
}

/**
 * A delivery URL with transformation components applied in order (one path
 * segment each), e.g. the "hide people" effects. `tail` components go last:
 * a width cap for a preview, a quality for a bake.
 */
export function transformedUrl(publicId: string, components: string[], tail: string[] = []): string | null {
  if (!env.CLOUDINARY_CLOUD_NAME) return null;
  const path = [...components, ...tail].join("/");
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${path ? `${path}/` : ""}${publicId}`;
}

/**
 * Waits until Cloudinary has finished rendering a derived image. Heavy effects
 * on a 360 photo can take a while the first time; Cloudinary answers 423 (or
 * 420) while it works.
 */
export async function waitForDerived(
  url: string,
  opts: { deadlineMs: number; intervalMs?: number; fetchImpl?: typeof fetch } = { deadlineMs: 60_000 },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + opts.deadlineMs;
  const interval = opts.intervalMs ?? 3000;
  for (;;) {
    const res = await doFetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (res?.ok) return { ok: true };
    if (res && res.status !== 423 && res.status !== 420) {
      return { ok: false, error: res.headers.get("x-cld-error") ?? `HTTP ${res.status}` };
    }
    if (Date.now() + interval > deadline) return { ok: false, error: "Still processing. Try again in a minute." };
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * A signed server-side upload of an image Cloudinary fetches from a URL (a
 * baked edit). The full path goes in public_id rather than a folder param, so
 * the result sits under this tenant's prefix in either folder mode.
 */
export async function uploadFromUrl(
  source: string,
  publicId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: { publicId: string; width: number; height: number; bytes: number } } | { ok: false; error: string }> {
  if (!hasCloudinary()) return { ok: false, error: "Media uploads are not configured yet." };
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp }, env.CLOUDINARY_API_SECRET as string);
  const form = new FormData();
  form.set("file", source);
  form.set("public_id", publicId);
  form.set("timestamp", String(timestamp));
  form.set("api_key", env.CLOUDINARY_API_KEY as string);
  form.set("signature", signature);
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form,
  }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as {
    public_id?: string;
    width?: number;
    height?: number;
    bytes?: number;
    error?: { message?: string };
  } | null;
  if (!res?.ok || !json?.public_id || !json.width || !json.height) {
    return { ok: false, error: json?.error?.message ?? "Cloudinary didn't accept the edited photo." };
  }
  return { ok: true, data: { publicId: json.public_id, width: json.width, height: json.height, bytes: json.bytes ?? 0 } };
}
