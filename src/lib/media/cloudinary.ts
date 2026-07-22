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
  const folder = `stay-witus/${tenantId}`;
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
