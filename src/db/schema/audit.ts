import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/**
 * Platform event log, surfaced in /platform/logs (BAM's dashboard).
 * kind is dot-namespaced: "auth.sign_in", "admin.tenant.update",
 * "webhook.stripe", "email.sent", "billing.invoice.paid", ...
 * data holds non-PII context only (ids, codes, statuses) — never message
 * bodies, tokens, or contact details.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = platform-level event (not tied to one tenant). */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id"),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_log_kind_idx").on(t.kind),
  ],
);
