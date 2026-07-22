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

export const amenityCategory = pgEnum("amenity_category", [
  "room",
  "property",
  "dining",
]);

export const rateOverrideKind = pgEnum("rate_override_kind", [
  "seasonal",
  "weekend",
  "event",
  "custom",
]);

/** A bookable room category ("Deluxe Queen", "Rooftop Suite"). Money in minor units (GHS pesewas). */
export const roomTypes = pgTable(
  "room_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: citext("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    baseRateMinor: integer("base_rate_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    maxOccupancy: integer("max_occupancy").notNull().default(2),
    bedConfig: text("bed_config"),
    sizeSqm: integer("size_sqm"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("room_types_tenant_slug_uq").on(t.tenantId, t.slug),
    index("room_types_tenant_idx").on(t.tenantId),
  ],
);

/** A physical room. Availability = units of a type not claimed for a date range. */
export const roomUnits = pgTable(
  "room_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    unitNumber: text("unit_number").notNull(),
    floor: text("floor"),
    notes: text("notes"),
    /** false = out of service (maintenance); excluded from availability. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("room_units_type_number_uq").on(t.roomTypeId, t.unitNumber),
    index("room_units_tenant_idx").on(t.tenantId),
  ],
);

export const roomTypePhotos = pgTable(
  "room_type_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("room_type_photos_type_idx").on(t.roomTypeId)],
);

export const amenities = pgTable(
  "amenities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Curated lucide icon key; free text rejected at the action layer. */
    iconKey: text("icon_key"),
    category: amenityCategory("category").notNull().default("property"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("amenities_tenant_idx").on(t.tenantId)],
);

export const roomTypeAmenities = pgTable(
  "room_type_amenities",
  {
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    amenityId: uuid("amenity_id")
      .notNull()
      .references(() => amenities.id, { onDelete: "cascade" }),
  },
  (t) => [unique("room_type_amenities_uq").on(t.roomTypeId, t.amenityId)],
);

/**
 * Date-range price overrides ("Detty December"). Nightly price = the matching
 * override with the highest priority, else the room type's base rate.
 * dowMask: bitmask Mon=1<<0 .. Sun=1<<6; null = every day in range.
 */
export const rateOverrides = pgTable(
  "rate_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: rateOverrideKind("kind").notNull().default("custom"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    dowMask: integer("dow_mask"),
    rateMinor: integer("rate_minor").notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_overrides_type_idx").on(t.roomTypeId)],
);
