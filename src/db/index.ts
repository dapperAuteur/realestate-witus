import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { env } from "@/lib/env";

// Node 22+ / Vercel functions ship a native WebSocket; the Pool driver needs it.
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

let _db: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Lazy singleton so importing modules never crashes a build without
 * DATABASE_URL. Callers that can render without a DB (e.g. the setup
 * fallback page) check `hasDatabase` first.
 */
export function db(): NeonHttpDatabase<typeof schema> {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!_db) {
    _db = drizzle(neon(env.DATABASE_URL), { schema });
  }
  return _db;
}

export type Tx = Parameters<
  Parameters<NeonDatabase<typeof schema>["transaction"]>[0]
>[0];

/**
 * Interactive transaction over the WebSocket Pool driver. The default db()
 * client is neon-http, which cannot hold a session — so anything needing
 * FOR UPDATE SKIP LOCKED or multi-statement atomicity (the unit-claim path)
 * comes through here. Pool per call, closed in finally: booking writes are
 * rare enough that correctness beats connection reuse.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const client = drizzleWs(pool, { schema });
    return await client.transaction(fn);
  } finally {
    await pool.end();
  }
}

export { schema };
