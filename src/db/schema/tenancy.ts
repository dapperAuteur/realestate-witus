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
// for real estate. One deployment serves every customer; a tenant is one
// agency/brokerage/developer brand. realestate.witus.online itself is the
// seeded "platform" tenant (flags.platform), and BAM's own service listings
// live on it.

// ── Typed JSONB shapes (server-resolved; never client-supplied) ──────────────

export interface TenantTheme {
  /** Display name in chrome/metadata, e.g. "Osu Property Group". */
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
  /** Curated template key (src/lib/templates.ts) — the design system. */
  templateKey?: string;
  /** Curated pairing key (src/lib/font-pairs.ts) — never free font names. */
  fontPairKey?: string;
  /** Listing gallery default (plans/03): a listing may override it. Unset = lightbox. */
  galleryMode?: "lightbox" | "strip";
}

export interface TenantFlags {
  /** The realestate.witus.online marketing/platform tenant (not an agency). */
  platform?: boolean;
  /** Render a "launching soon" landing instead of the live site. */
  comingSoon?: boolean;
  /** "Powered by RealEstate.WitUS" badge in the footer. */
  poweredBy?: boolean;
}

export interface TenantEmailConfig {
  /** Per-tenant sender so agency mail never says "RealEstate.WitUS". */
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface TenantLegal {
  termsUrl?: string;
  privacyUrl?: string;
}

// ── Tables ───────────────────────────────────────────────────────────────────

/** The brand registry. One row per agency/brokerage (plus the platform tenant). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: citext("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  isActive: boolean("is_active").notNull().default(true),
  theme: jsonb("theme").$type<TenantTheme>().notNull().default({}),
  flags: jsonb("flags").$type<TenantFlags>().notNull().default({}),
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
 * Per-tenant roles. Staff run the agency: owner covers manager covers agent.
 * An agent manages the listings and tours assigned to them.
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
      sql`${t.role} in ('owner','manager','agent')`,
    ),
    index("tenant_memberships_user_idx").on(t.userId),
  ],
);

export type TenantRole = "owner" | "manager" | "agent";

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
