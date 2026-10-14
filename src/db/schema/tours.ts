import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { mediaAssets } from "./content";
import { listings } from "./listings";
import { tenants } from "./tenancy";

// The 360 tour of a listing (plans/08 phase A). Ported from Wanderlust's
// scenes/moments schema (gemini/wanderlearn/wanderlearn-app src/db/schema/
// scenes.ts and moments.ts @ c7f5616, 2026-10-14), keyed by listing instead of
// destination, tenant-scoped, and without the parts this product leaves out:
// ambient and transition audio, hunt keys, cross-tour links, icon styling, and
// generative edits.
//
// Panoramas, floor plans and moment photos are real captures or human-drawn
// plans. Never AI-generated (product rule).

export const sceneStatus = pgEnum("scene_status", ["draft", "published", "unpublished"]);

/**
 * One floor's plan image. A listing has none (no plan), one (most homes) or
 * several (an upstairs, a basement, an office block). Replaces Wanderlust's
 * single per-tour map image so the mini-map can follow a buyer between floors.
 * Pins are normalized against the image's own width and height, which live on
 * the media row.
 */
export const tourFloorPlans = pgTable(
  "tour_floor_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** Free text the floor switcher shows: "Ground floor", "Level 2", "Basement". */
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tour_floor_plans_listing_idx").on(t.listingId),
    check("tour_floor_plans_label_chk", sql`char_length(${t.label}) between 1 and 40`),
  ],
);

export const tourScenes = pgTable(
  "tour_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** The room name buyers see: "Kitchen", "Main bedroom". */
    name: text("name").notNull(),
    caption: text("caption"),
    panoramaMediaId: uuid("panorama_media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    posterMediaId: uuid("poster_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    startYaw: real("start_yaw"),
    startPitch: real("start_pitch"),
    /** Clockwise horizon correction for tripod tilt, degrees. Null = none. */
    rollOffsetDeg: real("roll_offset_deg"),
    /**
     * Lowest a buyer may look, degrees below the horizon (negative). Keeps the
     * tripod or the photographer's feet off screen without editing the photo.
     * Hides the view, not the pixels. Null = no limit.
     */
    minPitchDeg: real("min_pitch_deg"),
    /** Which floor's plan this room sits on. Null = not on any plan. */
    floorPlanId: uuid("floor_plan_id").references(() => tourFloorPlans.id, {
      onDelete: "set null",
    }),
    /** Pin on that floor's plan, normalized 0..1 so it survives a re-upload at another size. */
    mapX: real("map_x"),
    mapY: real("map_y"),
    /**
     * The explicit tour order. Nullable on purpose (Wanderlust's lesson): null
     * means "follow the arrows from the start scene", so a tour nobody has
     * sequenced still reads in walking order.
     */
    orderIndex: integer("order_index"),
    /**
     * Where the tour opens. At most one per listing (partial unique index). A
     * flag on the scene rather than a column on listings, so the schema has no
     * listing to scene to listing cycle. None set = the first scene in order.
     */
    isStart: boolean("is_start").notNull().default(false),
    status: sceneStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tour_scenes_listing_idx").on(t.listingId),
    uniqueIndex("tour_scenes_one_start_per_listing").on(t.listingId).where(sql`${t.isStart}`),
    check(
      "tour_scenes_map_position_chk",
      sql`(${t.mapX} is null or ${t.mapX} between 0 and 1) and (${t.mapY} is null or ${t.mapY} between 0 and 1)`,
    ),
    check(
      "tour_scenes_min_pitch_chk",
      sql`${t.minPitchDeg} is null or ${t.minPitchDeg} between -85 and 0`,
    ),
    check(
      "tour_scenes_roll_chk",
      sql`${t.rollOffsetDeg} is null or ${t.rollOffsetDeg} between -15 and 15`,
    ),
  ],
);

export const sceneLinks = pgTable(
  "scene_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromSceneId: uuid("from_scene_id")
      .notNull()
      .references(() => tourScenes.id, { onDelete: "cascade" }),
    toSceneId: uuid("to_scene_id")
      .notNull()
      .references(() => tourScenes.id, { onDelete: "cascade" }),
    /** Doorway label for the arrow's accessible name ("Into the kitchen"). */
    name: text("name"),
    /** Where the arrow sits in the FROM scene. Null = not placed yet (invisible to buyers). */
    yaw: real("yaw"),
    pitch: real("pitch"),
    /**
     * Where the camera faces on arrival, for buyers who came through THIS
     * doorway. A property of the edge, not the room: enter a room by two doors
     * and you face two ways. Null falls back to the target's start view.
     */
    arrivalYaw: real("arrival_yaw"),
    arrivalPitch: real("arrival_pitch"),
    /** Clockwise turn of the arrow icon: 0 to 345 in 15 degree steps. Visual only. */
    arrowRotation: integer("arrow_rotation").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scene_links_from_idx").on(t.fromSceneId),
    index("scene_links_to_idx").on(t.toSceneId),
    check("scene_links_not_self_chk", sql`${t.fromSceneId} <> ${t.toSceneId}`),
    check(
      "scene_links_arrow_rotation_chk",
      sql`${t.arrowRotation} between 0 and 345 and ${t.arrowRotation} % 15 = 0`,
    ),
  ],
);

/**
 * Moments: one place at different times (plans/08: Before / After, Vacant /
 * Staged, Day / Night, construction progress). The timeline belongs to the
 * LISTING's tour, so "Before" means the same thing in every room and stays put
 * as the buyer walks. The base view is a real row (`is_base`) whose panorama in
 * each scene is the scene's own.
 */
export const tourMoments = pgTable(
  "tour_moments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** Free text (decision D2), with Before/After, Vacant/Staged, Day/Night as presets. */
    label: text("label").notNull(),
    /** Optional; sorting only. */
    occurredOn: date("occurred_on"),
    sortOrder: integer("sort_order").notNull().default(0),
    isBase: boolean("is_base").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tour_moments_listing_idx").on(t.listingId),
    uniqueIndex("tour_moments_one_base_per_listing").on(t.listingId).where(sql`${t.isBase}`),
    check("tour_moments_label_chk", sql`char_length(${t.label}) between 1 and 40`),
  ],
);

/** A scene's photo for one non-base moment. A room with no "Before" photo has no row. */
export const sceneMomentPanoramas = pgTable(
  "scene_moment_panoramas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => tourScenes.id, { onDelete: "cascade" }),
    momentId: uuid("moment_id")
      .notNull()
      .references(() => tourMoments.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    /** Degrees (-180..180) the photo is turned to line up with the base view. */
    headingOffsetDeg: real("heading_offset_deg").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("scene_moment_panoramas_scene_moment_unique").on(t.sceneId, t.momentId),
    index("scene_moment_panoramas_moment_idx").on(t.momentId),
    check(
      "scene_moment_panoramas_heading_chk",
      sql`${t.headingOffsetDeg} between -180 and 180`,
    ),
  ],
);

export const sceneHotspots = pgTable(
  "scene_hotspots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => tourScenes.id, { onDelete: "cascade" }),
    yaw: real("yaw").notNull(),
    pitch: real("pitch").notNull(),
    title: text("title").notNull(),
    /** Plain text, shown escaped. Never HTML, so there is nothing to sanitize. */
    content: text("content"),
    /** http(s) only (src/lib/tour/http-url.ts), re-checked when opened. */
    externalUrl: text("external_url"),
    /** Null = shown in every moment. Set = only while that moment is on screen. */
    momentId: uuid("moment_id").references(() => tourMoments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scene_hotspots_scene_idx").on(t.sceneId)],
);
