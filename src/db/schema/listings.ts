import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { TourLink } from "@/lib/tour/tour-links";
import { citext } from "./_types";
import { users } from "./auth";
import { mediaAssets } from "./content";
import { tenants } from "./tenancy";

// Properties and listings (plans/08 phase A, plans/05 forward-compat).
//
// A PROPERTY is the place: an address, a pin on the map, a kind. A LISTING is
// one sale of it (or of one building or unit in it). Relisting after a sale, or
// selling forty units of one block, is many listings on one property. The
// hierarchy (buildings, units) exists as bare tables so the listing foreign
// keys are real from day one; its admin screens, shared scenes and ownership
// transfer arrive with plans/05.
//
// Every word here is human-made (product rule): titles, highlights and
// descriptions come from agents and BAM, never a model.

export const propertyKind = pgEnum("property_kind", [
  "single_family",
  "multi_family",
  "commercial",
  "campus",
  "mixed",
]);

/**
 * The sale lifecycle. `draft` and `withdrawn` are private; `for_sale`,
 * `under_offer` and `sold` are public. Sold listings stay live with a badge
 * (HANDOFF design decisions: the marketing flywheel).
 */
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "for_sale",
  "under_offer",
  "sold",
  "withdrawn",
]);

export const PUBLIC_LISTING_STATUSES = ["for_sale", "under_offer", "sold"] as const;

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: propertyKind("kind").notNull().default("single_family"),
    /** Optional: a complex or estate has a name ("Osu Heights"); a house usually does not. */
    name: text("name"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    /**
     * What a listing with a hidden address shows instead (plans/08 6.1): the
     * neighborhood, then the locality. Never derived from the street address.
     */
    neighborhood: text("neighborhood"),
    locality: text("locality"),
    region: text("region"),
    postalCode: text("postal_code"),
    /** ISO 3166-1 alpha-2, upper case ("US", "GH"). */
    countryCode: text("country_code").notNull(),
    /** For the Leaflet map. Same precision as Wanderlust's destinations (~0.1 m). */
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("properties_tenant_idx").on(t.tenantId),
    check("properties_country_code_chk", sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
  ],
);

/** A building on a property. Bare until plans/05's hierarchy workstream. */
export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("buildings_property_idx").on(t.propertyId)],
);

/** A unit in a building. Bare until plans/05's hierarchy workstream. */
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("units_building_idx").on(t.buildingId)],
);

// ── Typed JSONB shapes (validated in src/lib/listings/, never trusted raw) ────

export type AreaUnit = "sqft" | "sqm";
export type LotAreaUnit = AreaUnit | "acres" | "hectares";

/** The facts strip. Every key optional: a commercial listing has no bedrooms. */
export interface ListingFacts {
  bedrooms?: number;
  /** Halves allowed (2.5). */
  bathrooms?: number;
  interiorArea?: number;
  areaUnit?: AreaUnit;
  lotArea?: number;
  lotAreaUnit?: LotAreaUnit;
  yearBuilt?: number;
  floors?: number;
  /** Multi-family and commercial: how many units the sale includes. */
  units?: number;
  zoning?: string;
  parkingSpaces?: number;
}

/** Facts and features in groups (plans/08 6.1 item 7). Agent-written bullet lines. */
export type FeatureGroupKey =
  | "interior"
  | "exterior"
  | "utilities"
  | "parking"
  | "fees"
  | "lot"
  | "construction";

export type ListingFeatures = Partial<Record<FeatureGroupKey, string[]>>;

/** Per-listing overrides of the tenant theme (plans/03: galleryMode). */
export interface ListingTheme {
  galleryMode?: "lightbox" | "strip";
}

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Restrict all three: deleting a place must never silently re-level or
    // orphan a listing someone may have embedded on their own site.
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "restrict" }),
    /**
     * Globally unique, not per tenant: the embed URL carries it, and plans/05's
     * ownership transfer must keep every embedded snippet working.
     */
    slug: citext("slug").notNull().unique(),
    status: listingStatus("status").notNull().default("draft"),
    title: text("title").notNull(),
    /** Two or three agent-written lines for the summary block. */
    highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
    /** Plain text; blank lines separate paragraphs. Never HTML. */
    description: text("description"),
    /** Null = price on request. Minor units; bigint because commercial prices overflow int4. */
    priceMinor: bigint("price_minor", { mode: "number" }),
    currency: text("currency").notNull().default("USD"),
    facts: jsonb("facts").$type<ListingFacts>().notNull().default({}),
    features: jsonb("features").$type<ListingFeatures>().notNull().default({}),
    /** Show the neighborhood instead of the street address, here and on the map. */
    hideAddress: boolean("hide_address").notNull().default(false),
    /** The staff member buyers contact. Null falls back to the tenant's owners. */
    agentUserId: text("agent_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Pinned in the viewer (plans/08: "Request a tour"). Validated by parseTourLinks. */
    tourLinks: jsonb("tour_links").$type<TourLink[]>().notNull().default([]),
    theme: jsonb("theme").$type<ListingTheme>().notNull().default({}),
    /** First time the listing went public. Kept through later status changes. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listings_tenant_idx").on(t.tenantId),
    index("listings_property_idx").on(t.propertyId),
    index("listings_tenant_status_idx").on(t.tenantId, t.status),
    // A unit always sits in a building; a unit listing names both.
    check("listings_unit_needs_building_chk", sql`${t.unitId} is null or ${t.buildingId} is not null`),
    check("listings_price_chk", sql`${t.priceMinor} is null or ${t.priceMinor} >= 0`),
    check("listings_currency_chk", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** The photo gallery, in display order. The first photo is the hero. */
export const listingPhotos = pgTable(
  "listing_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("listing_photos_listing_media_uq").on(t.listingId, t.mediaId),
    index("listing_photos_listing_idx").on(t.listingId),
  ],
);

export const inquiryKind = pgEnum("inquiry_kind", ["tour_request", "question"]);

/** Where the buyer opened the form (plans/08 section 7). */
export const inquirySource = pgEnum("inquiry_source", ["tour", "action_panel", "form"]);

export const listingInquiries = pgTable(
  "listing_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    kind: inquiryKind("kind").notNull(),
    source: inquirySource("source").notNull(),
    /** The listing page, or the agent's own site through the embed. */
    surface: text("surface").notNull().default("page"),
    name: text("name").notNull(),
    email: citext("email").notNull(),
    phone: text("phone"),
    message: text("message"),
    /** Tour requests: when the buyer can visit, in their words. */
    preferredTimes: text("preferred_times"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listing_inquiries_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("listing_inquiries_listing_idx").on(t.listingId),
    check("listing_inquiries_surface_chk", sql`${t.surface} in ('page','embed')`),
    check("listing_inquiries_status_chk", sql`${t.status} in ('new','replied','closed')`),
  ],
);

/**
 * View counters, one row per listing per day per surface. Counts only: no
 * visitor, no IP, nothing that identifies anyone. Opening the tour is counted
 * apart from loading the page (plans/08 section 7), because the tour is the
 * product and the ratio is what an agent shows their seller.
 */
export const listingViews = pgTable(
  "listing_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    surface: text("surface").notNull(),
    pageViews: integer("page_views").notNull().default(0),
    tourOpens: integer("tour_opens").notNull().default(0),
  },
  (t) => [
    unique("listing_views_listing_day_surface_uq").on(t.listingId, t.day, t.surface),
    check("listing_views_surface_chk", sql`${t.surface} in ('page','embed')`),
  ],
);
