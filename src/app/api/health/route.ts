import { sql } from "drizzle-orm";
import { db } from "@/db";

// Uptime probe for Better Stack (and any other monitor). A homepage check can
// answer 200 from cache while Postgres is face-down, so this endpoint really
// round-trips to the database on every request and refuses to be cached.
//
// TENANT-AGNOSTIC BY CONSTRUCTION: GET takes no `Request`, so it cannot read
// the Host header and cannot reach the tenant resolver. "Healthy" means the
// app runs and the database answers, never that some particular brand exists.
// An unknown host or a domain mid-DNS-cutover must not read as an outage.
//
// LEAKS NOTHING: no version, no env values, no counts, no tenant or user data,
// and no error text (a Neon connection failure stringifies with the full
// postgres://user:pass@host URL, in the response *and* in the log sink).
//
// The body is a fixed machine contract, not the app's Result envelope
// (`@/lib/result`): monitors match on these literal keys, and the envelope's
// `error` string is human prose, which is the thing we must never emit here.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMEOUT_MS = 4_000;

// Every response, both codes: a monitor must never grade a cached body.
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

/**
 * Cheapest possible liveness query, capped at TIMEOUT_MS. Returns a boolean and
 * nothing else, so the caller has no error value to accidentally serialize.
 */
async function databaseIsAlive(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // An async IIFE so a synchronous throw (no DATABASE_URL) also arrives as a
    // rejection, and so the losing racer is a real Promise we can silence.
    const query = (async () => {
      await db().execute(sql`select 1`);
    })();
    // If the timeout wins, the query's later failure must not resurface as an
    // unhandled rejection (which Sentry would then report with its full text).
    query.catch(() => {});

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("health check timed out")), TIMEOUT_MS);
    });

    await Promise.race([query, timeout]);
    return true;
  } catch {
    // Bare catch, no binding: the error is unreachable by construction, so no
    // code path can put a connection string in a body or a log line. The log
    // message is a fixed literal for exactly the same reason.
    console.error("[health] database liveness check failed");
    return false;
  } finally {
    // Cleared on the happy path too, so the timer never fires (and never
    // rejects) after the race has been decided.
    clearTimeout(timer);
  }
}

export async function GET() {
  if (!(await databaseIsAlive())) {
    return Response.json(
      { ok: false, error: "database_unreachable" },
      { status: 503, headers: NO_STORE },
    );
  }
  return Response.json({ ok: true, checks: { db: "ok" } }, { status: 200, headers: NO_STORE });
}

// Some monitors probe with HEAD; the status code carries the whole verdict.
export async function HEAD() {
  const alive = await databaseIsAlive();
  return new Response(null, { status: alive ? 200 : 503, headers: NO_STORE });
}
