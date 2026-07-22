import {
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

// The concierge marketplace-lite. Partners APPLY through the public site,
// the owner vets/approves/suspends, approved partners keep their own profile
// current via an expiring magic link. The hotel connects, never brokers:
// guests contact partners directly (wa.me / tel), no payment through the site.

export const partnerCategory = pgEnum("partner_category", [
  "driver",
  "tour_guide",
  "nightlife",
  "food",
  "wellness",
  "shopping",
  "emergency",
  "other",
]);

export const partnerStatus = pgEnum("partner_status", [
  "applied",
  "approved",
  "suspended",
  "archived",
]);

export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: citext("slug").notNull(),
    name: text("name").notNull(),
    category: partnerCategory("category").notNull(),
    blurb: text("blurb"),
    phone: text("phone"),
    whatsappE164: text("whatsapp_e164"),
    email: text("email"),
    photoMediaId: uuid("photo_media_id"),
    /** "from GHS 800/day" — free text, partner-maintained. */
    priceNote: text("price_note"),
    /** "day trips within 2 to 4 hours" */
    coverageNote: text("coverage_note"),
    status: partnerStatus("status").notNull().default("applied"),
    /** Consent to public listing, captured at application. */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Owner-private vetting notes; never rendered publicly. */
    adminNotes: text("admin_notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("partners_tenant_slug_uq").on(t.tenantId, t.slug),
    index("partners_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/** Expiring magic-link tokens for partner self-edit. Suspension revokes all. */
export const partnerEditTokens = pgTable(
  "partner_edit_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("partner_edit_tokens_partner_idx").on(t.partnerId)],
);

/**
 * P2: verified-guest feedback on partners. Requires a stay account tied to a
 * completed reservation. Owner moderates before anything shows publicly.
 */
export const partnerFeedback = pgTable(
  "partner_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id").notNull(),
    stayAccountId: uuid("stay_account_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("partner_feedback_res_partner_uq").on(t.reservationId, t.partnerId),
    index("partner_feedback_partner_idx").on(t.partnerId),
  ],
);
