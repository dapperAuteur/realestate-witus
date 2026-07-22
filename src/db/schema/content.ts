import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext } from "./_types";
import { tenants } from "./tenancy";

// Owner-editable content. Every word is human-written (ecosystem rule:
// no AI-generated content reaches guests) — seeds are placeholders the
// owner rewrites during the content load.

export const attractionZone = pgEnum("attraction_zone", ["walkable", "day_trip"]);

export const attractionCategory = pgEnum("attraction_category", [
  "food_drink",
  "nightlife",
  "culture",
  "shopping",
  "health",
  "beach",
  "nature",
  "other",
]);

export const mediaKind = pgEnum("media_kind", [
  "photo",
  "pdf_menu",
  "logo",
  "favicon",
  "og",
  "screenshot",
  "screen_recording",
]);

/** Walkable Osu spots + day trips within a 2 to 4 hour drive. */
export const attractions = pgTable(
  "attractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    zone: attractionZone("zone").notNull().default("walkable"),
    category: attractionCategory("category").notNull().default("other"),
    /** Walkable spots: meters + minutes on foot. */
    distanceM: integer("distance_m"),
    walkMinutes: integer("walk_minutes"),
    /** Day trips: minutes by car. */
    driveMinutes: integer("drive_minutes"),
    blurb: text("blurb"),
    mediaId: uuid("media_id"),
    mapUrl: text("map_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attractions_tenant_zone_idx").on(t.tenantId, t.zone)],
);

/**
 * Keyed page sections: hero, about, dining, contact, faq, policies,
 * virtual_tour (RealSee embed URLs live in data). One row per key per tenant.
 */
export const siteSections = pgTable(
  "site_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: citext("key").notNull(),
    title: text("title"),
    /** Markdown body, human-written. */
    body: text("body"),
    /** Structured extras: FAQ items, policy rules, embed URLs, menu media ids. */
    data: jsonb("data"),
    isPublished: boolean("is_published").notNull().default(false),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("site_sections_tenant_key_uq").on(t.tenantId, t.key)],
);

/** Cloudinary-backed media registry (signed uploads; wanderlearn pattern). */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cloudinaryPublicId: text("cloudinary_public_id").notNull(),
    kind: mediaKind("kind").notNull().default("photo"),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    /** Meaningful or empty — never a filename (a11y rule). */
    altText: text("alt_text"),
    status: text("status").notNull().default("uploading"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_assets_tenant_idx").on(t.tenantId)],
);
