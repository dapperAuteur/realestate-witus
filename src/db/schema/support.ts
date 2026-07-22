import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tenants } from "./tenancy";

// Lifted from wanderlearn-app src/db/schema/support.ts (the ecosystem bug/
// feature-request system; BAM is the sole support admin, platform-wide) and
// adapted: + tenantId (cross-tenant inbox in /platform), + typed attachments
// covering BOTH screenshot uploads (Cloudinary media) and screen-recording
// share links (Loom/Drive URLs) per BAM's requirement. New threads are also
// forwarded to WitUS Inbox (sendToInbox HMAC).

export const supportCategory = pgEnum("support_category", [
  "bug",
  "ui_ux",
  "feature_request",
  "question",
  "content",
  "billing",
  "other",
]);

export const supportThreadStatus = pgEnum("support_thread_status", [
  "open",
  "waiting_user",
  "waiting_admin",
  "resolved_pending_confirm",
  "resolved_user_confirmed",
  "resolved_user_disputed",
  "closed",
]);

export const supportPriority = pgEnum("support_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const supportAuthorRole = pgEnum("support_author_role", ["user", "admin"]);

/** One attachment on a support message. */
export interface SupportAttachment {
  kind: "screenshot" | "recording_link";
  /** mediaAssets.id for screenshots (Cloudinary signed upload). */
  mediaId?: string;
  /** Share link for screen recordings (Loom, Drive, etc.). */
  url?: string;
  label?: string;
}

export const supportThreads = pgTable(
  "support_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    category: supportCategory("category").notNull().default("question"),
    status: supportThreadStatus("status").notNull().default("open"),
    priority: supportPriority("priority").notNull().default("normal"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    userConfirmedAt: timestamp("user_confirmed_at", { withTimezone: true }),
    userConfirmedPositive: text("user_confirmed_positive"),
    userDisputeReason: text("user_dispute_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("support_threads_status_last_idx").on(t.status, t.lastMessageAt),
    index("support_threads_tenant_idx").on(t.tenantId),
    index("support_threads_user_idx").on(t.userId),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => supportThreads.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorRole: supportAuthorRole("author_role").notNull(),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<SupportAttachment[]>(),
    seenByUserAt: timestamp("seen_by_user_at", { withTimezone: true }),
    seenByAdminAt: timestamp("seen_by_admin_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("support_messages_thread_idx").on(t.threadId)],
);
