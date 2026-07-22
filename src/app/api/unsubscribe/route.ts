import { suppressEmail, verifyUnsubscribeSig } from "@/lib/campaigns";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

// One-click marketing unsubscribe. GET (email clients prefetch-safe enough
// for v1; POST also accepted). HMAC-signed per tenant+email — no guessable
// ids. Response is a minimal HTML page (locale-less by nature of the link).

async function handle(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant") ?? "";
  const email = url.searchParams.get("email") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  const ok =
    tenantId && email && sig && verifyUnsubscribeSig(tenantId, email, sig);
  if (ok) {
    await suppressEmail(tenantId, email).catch(() => null);
  }
  const [tenant] = ok
    ? await db()
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
        .catch(() => [])
    : [];

  const message = ok
    ? `You are unsubscribed from marketing emails${tenant ? ` from ${tenant.name}` : ""}. Booking confirmations still arrive.`
    : "This unsubscribe link is not valid.";
  return new Response(
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui,sans-serif;display:flex;min-height:100dvh;align-items:center;justify-content:center"><main style="max-width:28rem;padding:1.5rem;text-align:center"><p>${message}</p></main></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
