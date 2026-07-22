import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { events } from "./events";
import { tenants } from "./tenancy";

// Broadcast messaging: the owner writes once and reaches the right guests.
// "Water is down" (urgent → site-wide banner + email), "museum trip Saturday,
// reserve your spot" (event-linked → message carries an RSVP button).
// Audience segments are derived from reservations at send time:
//   current_guests  = checked_in, or confirmed with check_in <= today < check_out
//   upcoming_guests = confirmed with check_in > today
//   past_guests     = checked_out
//   all_subscribers = everyone above plus stay accounts

export const announcementUrgency = pgEnum("announcement_urgency", [
  "normal",
  "urgent",
]);

export const announcementAudience = pgEnum("announcement_audience", [
  "all_subscribers",
  "current_guests",
  "upcoming_guests",
  "past_guests",
]);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    urgency: announcementUrgency("urgency").notNull().default("normal"),
    audience: announcementAudience("audience").notNull().default("current_guests"),
    /** Optional: attach an event so the email/banner carries "reserve your spot". */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    /** Shown on the site (banner if urgent, feed otherwise) from this moment. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Email fan-out completed. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_tenant_published_idx").on(t.tenantId, t.publishedAt)],
);

/** Per-recipient delivery record: dedupe + audit trail for every send. */
export const announcementDeliveries = pgTable(
  "announcement_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    unique("announcement_deliveries_uq").on(t.announcementId, t.email),
    index("announcement_deliveries_announcement_idx").on(t.announcementId),
  ],
);

/**
 * Marketing suppression list: unsubscribes (and later, complaints). Checked
 * before every campaign send; transactional mail (confirmations, urgent
 * operational notices) is a different consent basis and does NOT check this.
 */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason").notNull().default("unsubscribe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("email_suppressions_tenant_email_uq").on(t.tenantId, t.email)],
);
