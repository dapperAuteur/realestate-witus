import { createHmac } from "node:crypto";
import { env, hasWitusInbox } from "@/lib/env";

// First slice of workstream 16: forward operator-relevant events to BAM's
// one WitUS Inbox. HMAC-signed (ecosystem rule: cross-repo webhooks signed,
// constant-time verify on the receiving side), best-effort — a dead inbox
// never blocks the product action that triggered it.

export async function sendToInbox(
  type: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!hasWitusInbox) return false;
  try {
    const body = JSON.stringify({
      source: "stay-witus",
      type,
      sentAt: new Date().toISOString(),
      payload,
    });
    const signature = createHmac("sha256", env.WITUS_INBOX_HMAC_SECRET as string)
      .update(body)
      .digest("hex");
    const res = await fetch(env.WITUS_INBOX_URL as string, {
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
