import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tenants } from "./tenancy";

// PLATFORM billing: the hotel (tenant owner) pays BAM for the product.
// Distinct from guest→hotel payments (booking.ts payments table).
// Rails: card via BAM's Stripe (B4C LLC, US — Stripe works for BAM even though
// Ghana hotels can't merchant on it), or MoMo transfer to BAM's MoMo number.
// MoMo flow is claim-then-confirm: the invoice shows BAM's number + a unique
// reference; the payer sends and taps "I've sent it" (momoClaimedAt); BAM
// confirms in /platform/billing which marks the invoice paid.

export const invoiceKind = pgEnum("invoice_kind", ["setup", "monthly", "custom"]);
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
  "overdue",
]);
export const invoiceMethod = pgEnum("invoice_method", ["stripe", "momo", "other"]);

/** Per-tenant pricing, set by BAM in /platform — prices are per client. */
export const tenantBilling = pgTable("tenant_billing", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  setupFeeMinor: integer("setup_fee_minor").notNull().default(0),
  monthlyFeeMinor: integer("monthly_fee_minor").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  billingEmail: text("billing_email"),
  /** BAM's-Stripe customer id for this tenant owner (card payers). */
  stripeCustomerId: text("stripe_customer_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformInvoices = pgTable(
  "platform_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Human-facing code, e.g. INV-2026-0007. Also the MoMo transfer reference. */
    code: text("code").notNull().unique(),
    kind: invoiceKind("kind").notNull(),
    description: text("description"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: invoiceStatus("status").notNull().default("draft"),
    dueDate: date("due_date"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    method: invoiceMethod("method"),
    /** Stripe checkout/payment-intent id when method = stripe. */
    providerRef: text("provider_ref").unique(),
    /** Payer tapped "I've sent it" on the MoMo instructions. */
    momoClaimedAt: timestamp("momo_claimed_at", { withTimezone: true }),
    /** BAM (platform owner) who confirmed the MoMo receipt. */
    confirmedBy: text("confirmed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("platform_invoices_tenant_idx").on(t.tenantId),
    index("platform_invoices_status_idx").on(t.status),
  ],
);
