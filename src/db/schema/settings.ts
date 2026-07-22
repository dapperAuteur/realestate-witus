import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bookingMode } from "./booking";
import { tenants } from "./tenancy";

/** One row per tenant: the hotel's operational settings. */
export const hotelSettings = pgTable("hotel_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  hotelName: text("hotel_name").notNull(),
  address: text("address"),
  lat: text("lat"),
  lng: text("lng"),
  phone: text("phone"),
  /** wa.me target on every page a guest might have a question. */
  whatsappE164: text("whatsapp_e164"),
  /** Existing guest WhatsApp group (v1 community surface until the hub ships). */
  whatsappGroupUrl: text("whatsapp_group_url"),
  email: text("email"),
  checkinTime: text("checkin_time").notNull().default("14:00"),
  checkoutTime: text("checkout_time").notNull().default("11:00"),
  timezone: text("timezone").notNull().default("Africa/Accra"),
  bookingMode: bookingMode("booking_mode").notNull().default("instant_deposit"),
  depositPercent: integer("deposit_percent").notNull().default(30),
  holdMinutes: integer("hold_minutes").notNull().default(15),
  cancellationPolicy: jsonb("cancellation_policy").$type<{
    freeUntilDays?: number;
    penaltyPercent?: number;
  }>(),
  social: jsonb("social").$type<Record<string, string>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small transactional-email audit (aids support: "did the confirmation send?"). */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    to: text("to").notNull(),
    template: text("template").notNull(),
    reservationId: uuid("reservation_id"),
    providerId: text("provider_id"),
    status: text("status").notNull().default("sent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_log_tenant_idx").on(t.tenantId)],
);
