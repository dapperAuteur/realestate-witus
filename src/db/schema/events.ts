import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext } from "./_types";
import { tenants } from "./tenancy";

export const eventKind = pgEnum("event_kind", [
  "hotel",
  "cultural",
  "seasonal",
  "area",
]);

export const rsvpMode = pgEnum("rsvp_mode", ["none", "free_rsvp", "paid_ticket"]);

export const rsvpStatus = pgEnum("rsvp_status", [
  "confirmed",
  "waitlist",
  "cancelled",
  "checked_in",
]);

export const inquiryStatus = pgEnum("inquiry_status", [
  "new",
  "contacted",
  "quoted",
  "confirmed",
  "declined",
  "archived",
]);

/** Hotel events plus cultural/seasonal area happenings (Detty December, festivals). */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: citext("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    kind: eventKind("kind").notNull().default("hotel"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    locationText: text("location_text"),
    capacity: integer("capacity"),
    /** Denormalized count; capacity enforced by atomic conditional UPDATE. */
    rsvpCount: integer("rsvp_count").notNull().default(0),
    rsvpMode: rsvpMode("rsvp_mode").notNull().default("none"),
    /** P2 paid tickets. */
    priceMinor: integer("price_minor"),
    heroMediaId: uuid("hero_media_id"),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("events_tenant_slug_uq").on(t.tenantId, t.slug),
    index("events_tenant_starts_idx").on(t.tenantId, t.startsAt),
  ],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    partySize: integer("party_size").notNull().default(1),
    status: rsvpStatus("status").notNull().default("confirmed"),
    paymentId: uuid("payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_rsvps_event_idx").on(t.eventId)],
);

/** Rooftop private-hire pipeline. Saved locally AND forwarded to WitUS Inbox. */
export const venueInquiries = pgTable(
  "venue_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    eventType: text("event_type"),
    preferredDate: date("preferred_date"),
    altDate: date("alt_date"),
    partySize: integer("party_size"),
    budgetRange: text("budget_range"),
    message: text("message"),
    status: inquiryStatus("status").notNull().default("new"),
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("venue_inquiries_tenant_status_idx").on(t.tenantId, t.status)],
);
