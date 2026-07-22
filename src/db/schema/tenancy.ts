import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext } from "./_types";
import { users } from "./auth";

// Tenancy model lifted from witus-learn (src/db/schema/tenancy.ts) and adapted
// for hotels. One deployment serves every hotel; a tenant is one property/brand.
// stay.witus.online itself is the seeded "platform" tenant (flags.platform).

// ── Typed JSONB shapes (server-resolved; never client-supplied) ──────────────

export interface TenantTheme {
  /** Display name in chrome/metadata, e.g. "Sankofa House Osu". */
  name?: string;
  shortName?: string;
  wordmark?: string;
  logoUrl?: string;
  faviconUrl?: string;
  ogDefaultUrl?: string;
  themeColor?: string;
  /** Curated preset key (src/lib/brand-presets.ts) — server-normalized, never free hex. */
  presetKey?: string;
  /** Resolved accent tokens derived from the preset, e.g. { accent, accentFg }. */
  colors?: Record<string, string>;
  // ── Rung 2 section control (BAM decision 2026-07-13; src/lib/sections.ts
  //    normalizes all four — unknown keys/variants collapse to defaults) ──
  /** Curated template key (src/lib/templates.ts) — the design system. */
  templateKey?: string;
  /** Curated pairing key (src/lib/font-pairs.ts) — never free font names. */
  fontPairKey?: string;
  /** Homepage section order; missing known sections append in default order. */
  sectionOrder?: string[];
  /** Hidden sections ("hero" is never hideable). */
  sectionHidden?: string[];
  /** Per-section layout variant, e.g. { rooms: "list" }. */
  sectionVariants?: Record<string, string>;
}

export interface TenantFlags {
  /** The stay.witus.online marketing/platform tenant (not a hotel). */
  platform?: boolean;
  /** Feature toggles BAM manages per tenant from /platform. */
  events?: boolean;
  dining?: boolean;
  concierge?: boolean;
  hub?: boolean;
  virtualTour?: boolean;
  announcements?: boolean;
  /** Render a "launching soon" landing instead of the live site. */
  comingSoon?: boolean;
  /** "Powered by Stay.WitUS" badge in the footer. */
  poweredBy?: boolean;
}

/**
 * Guest-facing payment rail for THIS hotel (guests -> hotel). Ghana tenants use
 * Paystack (GHS; MoMo + cards). Tenants in Stripe-supported countries may use
 * their own Stripe instead — the provider is chosen per tenant.
 * Secrets are NOT stored in the row: `secretRef` names the env var holding the
 * secret key (e.g. TENANT_OSU_PAYSTACK_SECRET) until a KMS-backed store lands.
 */
export interface TenantPaymentConfig {
  provider?: "paystack" | "stripe";
  currency?: string; // "GHS" for Ghana tenants (FX Act 723), local currency elsewhere
  publicKey?: string;
  secretRef?: string;
  subaccount?: string;
  statementDescriptor?: string;
}

export interface TenantEmailConfig {
  /** Per-tenant sender so hotel mail never says "Stay.WitUS" (witus-learn pattern). */
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface TenantLegal {
  termsUrl?: string;
  privacyUrl?: string;
}

// ── Tables ───────────────────────────────────────────────────────────────────

/** The brand registry. One row per hotel (plus the platform tenant). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: citext("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  isActive: boolean("is_active").notNull().default(true),
  theme: jsonb("theme").$type<TenantTheme>().notNull().default({}),
  flags: jsonb("flags").$type<TenantFlags>().notNull().default({}),
  payment: jsonb("payment").$type<TenantPaymentConfig>().notNull().default({}),
  email: jsonb("email").$type<TenantEmailConfig>().notNull().default({}),
  legal: jsonb("legal").$type<TenantLegal>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** host → tenant resolution. Managed via /platform (BAM) and /admin/domains (brand admin). */
export const tenantDomains = pgTable("tenant_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  host: citext("host").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-tenant roles. Staff run the hotel; partners edit only their concierge
 * profile; guests hold optional post-booking stay accounts.
 */
export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tenant_memberships_tenant_user_uq").on(t.tenantId, t.userId),
    check(
      "tenant_memberships_role_chk",
      sql`${t.role} in ('owner','manager','front_desk','partner','guest')`,
    ),
    index("tenant_memberships_user_idx").on(t.userId),
  ],
);

export type TenantRole = "owner" | "manager" | "front_desk" | "partner" | "guest";

/** key/value platform settings; optional tenant_id for per-tenant overrides. */
export const platformSettings = pgTable(
  "platform_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("platform_settings_tenant_key_uq").on(t.tenantId, t.key)],
);
