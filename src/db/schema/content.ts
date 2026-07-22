import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

// Media registry. Every word and image is human-made (product rule: no
// AI-generated content reaches buyers) — listing copy, photography, and tour
// panoramas come from BAM's capture pipeline or the agent.

export const mediaKind = pgEnum("media_kind", [
  "photo",
  "panorama",
  "floor_plan",
  "logo",
  "favicon",
  "og",
  "screenshot",
  "screen_recording",
]);

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
