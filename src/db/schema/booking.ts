import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { daterange } from "./_types";
import { users } from "./auth";
import { roomTypes, roomUnits } from "./rooms";
import { tenants } from "./tenancy";

// The booking engine core. Double-booking is made impossible at the DB level:
// migration 0000_extensions adds
//   CREATE EXTENSION IF NOT EXISTS btree_gist;
//   ALTER TABLE unit_claims ADD CONSTRAINT unit_claims_no_overlap
//     EXCLUDE USING gist (unit_id WITH =, stay WITH &&)
//     WHERE (released_at IS NULL);
// Unit selection runs FOR UPDATE SKIP LOCKED inside a transaction; the
// exclusion constraint is the backstop under any race.

export const claimKind = pgEnum("claim_kind", ["hold", "booking", "blockout"]);

export const reservationStatus = pgEnum("reservation_status", [
  "pending_payment",
  "awaiting_approval",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
  "expired",
]);

export const bookingMode = pgEnum("booking_mode", [
  "request",
  "instant_full",
  "instant_deposit",
]);

export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "deposit_paid",
  "paid",
  "refunded",
  "partial_refund",
]);

export const paymentProvider = pgEnum("payment_provider", ["paystack", "stripe"]);

export const paymentKind = pgEnum("payment_kind", [
  "deposit",
  "balance",
  "full",
  "ticket",
  "refund",
]);

export const paymentState = pgEnum("payment_state", [
  "initiated",
  "success",
  "failed",
  "refunded",
]);

/**
 * Holds + bookings + blockouts in one table. A hold is a claim with
 * kind='hold' and expiresAt; expired holds are lazily filtered in availability
 * queries and swept (releasedAt set) by the daily cron.
 */
export const unitClaims = pgTable(
  "unit_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => roomUnits.id, { onDelete: "cascade" }),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    /** Half-open [check_in, check_out) so back-to-back stays don't collide. */
    stay: daterange("stay").notNull(),
    kind: claimKind("kind").notNull(),
    reservationId: uuid("reservation_id"),
    /** Anonymous checkout session that owns a hold. */
    holdSession: text("hold_session"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    /** Blockouts: "Booking.com", "maintenance", "owner use". */
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unit_claims_unit_idx").on(t.unitId),
    index("unit_claims_tenant_idx").on(t.tenantId),
    index("unit_claims_reservation_idx").on(t.reservationId),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Human code, e.g. OSU-2026-0042; also the guest's lookup key. */
    code: text("code").notNull().unique(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone"),
    guestCountry: text("guest_country"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    status: reservationStatus("status").notNull().default("pending_payment"),
    /** Snapshot of the tenant's mode at booking time. */
    bookingMode: bookingMode("booking_mode").notNull(),
    totalMinor: integer("total_minor").notNull(),
    depositMinor: integer("deposit_minor").notNull().default(0),
    currency: text("currency").notNull().default("GHS"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    /** Per-night price snapshot [{date, rateMinor, overrideLabel?}]. */
    rateBreakdown: jsonb("rate_breakdown").$type<
      { date: string; rateMinor: number; overrideLabel?: string }[]
    >(),
    cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot").$type<{
      freeUntilDays?: number;
      penaltyPercent?: number;
    }>(),
    specialRequests: text("special_requests"),
    /** Marketing consent captured at booking (plans/09); never pre-checked. */
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    marketingOptInAt: timestamp("marketing_opt_in_at", { withTimezone: true }),
    /** Snapshot of the applied promo, if any — survives later code edits. */
    promoCode: text("promo_code"),
    discountMinor: integer("discount_minor").notNull().default(0),
    source: text("source").notNull().default("website"),
    adminNotes: text("admin_notes"),
    /** Null for accountless guests; set when a stay account is activated. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reservations_tenant_status_idx").on(t.tenantId, t.status),
    index("reservations_tenant_checkin_idx").on(t.tenantId, t.checkIn),
    index("reservations_guest_email_idx").on(t.guestEmail),
  ],
);

/**
 * Guest→hotel payments. providerRef unique = webhook idempotency chokepoint
 * (pattern: tour-manager-os Stripe webhook). Provider is per-tenant: Paystack
 * for Ghana tenants, Stripe for tenants in Stripe-supported countries.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    /** P2: paid event tickets reference their RSVP instead. */
    eventRsvpId: uuid("event_rsvp_id"),
    provider: paymentProvider("provider").notNull(),
    providerRef: text("provider_ref").notNull().unique(),
    kind: paymentKind("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    state: paymentState("state").notNull().default("initiated"),
    /** momo | card | bank — as reported by the provider. */
    channel: text("channel"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_tenant_idx").on(t.tenantId),
    index("payments_reservation_idx").on(t.reservationId),
  ],
);
