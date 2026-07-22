import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Test-time probe: does a table exist in the connected database yet?
 * Integration suites that depend on a filed-but-unapplied migration gate on
 * this so the suite skips (visibly, by suite name) instead of failing, and
 * activates the moment BAM runs the migration.
 */
export async function tableExists(name: string): Promise<boolean> {
  try {
    const res = await db().execute<{ n: number }>(
      sql`select count(*)::int as n from information_schema.tables where table_name = ${name}`,
    );
    return res.rows[0].n > 0;
  } catch {
    return false;
  }
}
