import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Platform audit trail (workstream 12 tail), surfaced in /platform/logs.
// writeAudit is FIRE-AND-FORGET by contract: an audit failure must never
// fail the action it records. data carries non-PII context only — ids,
// codes, statuses; never bodies, tokens, or guest contact details.

export interface AuditEntry {
  tenantId?: string | null;
  actorUserId?: string | null;
  kind: string;
  summary: string;
  data?: Record<string, string | number | boolean | null>;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db().insert(auditLog).values({
      tenantId: entry.tenantId ?? null,
      actorUserId: entry.actorUserId ?? null,
      kind: entry.kind,
      summary: entry.summary,
      data: entry.data ?? null,
    });
  } catch {
    // Never let the ledger break the till.
  }
}

export async function listAudit(opts: {
  tenantId?: string;
  kindPrefix?: string;
  before?: Date;
  limit?: number;
}) {
  const conditions = [];
  if (opts.tenantId) conditions.push(eq(auditLog.tenantId, opts.tenantId));
  if (opts.before) conditions.push(lt(auditLog.createdAt, opts.before));
  const rows = await db()
    .select()
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(opts.limit ?? 100, 200));
  // kind prefix filtering in JS keeps the SQL index simple.
  return opts.kindPrefix
    ? rows.filter((row) => row.kind.startsWith(opts.kindPrefix as string))
    : rows;
}
