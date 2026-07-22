import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext } from "./_types";
import { tenants } from "./tenancy";

// Promo codes (plans/09, BAM 2026-07-14). A code discounts the STAY TOTAL at
// confirm time; the reservation snapshots code + discount so later price
// edits never change what a guest was promised. Redemption counting is a
// conditional UPDATE inside the confirm transaction — no oversell under race.

export const promoKind = pgEnum("promo_kind", ["percent", "fixed"]);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Case-insensitive: guests type detty25, DETTY25, Detty25 alike. */
    code: citext("code").notNull(),
    kind: promoKind("kind").notNull(),
    /** percent: 1-90 (whole %). fixed: minor units off the stay total. */
    value: integer("value").notNull(),
    /** Null = valid for every room type. */
    roomTypeId: uuid("room_type_id"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("promo_codes_tenant_code_uq").on(t.tenantId, t.code),
    index("promo_codes_tenant_idx").on(t.tenantId),
  ],
);
