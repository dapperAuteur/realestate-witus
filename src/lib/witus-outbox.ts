import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

// WitUS Outbox sender (workstream 16): publishable moments (announcement or
// event goes live) become social-post drafts in BAM's outbox. HMAC-signed,
// best-effort, and DOUBLE-gated: env presence AND the explicit
// OUTBOX_TRIGGER_ENABLED switch (task 06 says keep it false until tested).

export const hasOutbox = () =>
  Boolean(env.OUTBOX_URL && env.OUTBOX_HMAC_SECRET && env.OUTBOX_TRIGGER_ENABLED);

export async function sendToOutbox(
  type: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!hasOutbox()) return false;
  try {
    const body = JSON.stringify({
      source: "stay-witus",
      type,
      sentAt: new Date().toISOString(),
      payload,
    });
    const signature = createHmac("sha256", env.OUTBOX_HMAC_SECRET as string)
      .update(body)
      .digest("hex");
    const res = await fetch(env.OUTBOX_URL as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-witus-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
