import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attractions, siteSections } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

// Owner-editable content (CMS workstream). Every word is human-written —
// this module only stores what the owner typed; no generated copy, ever.

/** Keys the site actually renders today; faq/policies join when their pages do. */
export const EDITABLE_SECTION_KEYS = [
  "hero",
  "about",
  "dining",
  "virtual_tour",
] as const;
export type EditableSectionKey = (typeof EDITABLE_SECTION_KEYS)[number];

/** Which structured data fields each key accepts (validated https URLs). */
const DATA_FIELDS: Record<EditableSectionKey, readonly string[]> = {
  hero: ["imageUrl", "imageAlt"],
  about: [],
  dining: [],
  virtual_tour: ["embedUrl"],
};

const URL_FIELDS = new Set(["imageUrl", "embedUrl"]);

export function isEditableSectionKey(value: string): value is EditableSectionKey {
  return (EDITABLE_SECTION_KEYS as readonly string[]).includes(value);
}

export async function listEditableSections(tenantId: string) {
  const rows = await db()
    .select()
    .from(siteSections)
    .where(eq(siteSections.tenantId, tenantId));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return EDITABLE_SECTION_KEYS.map((key) => ({
    key,
    row: byKey.get(key) ?? null,
  }));
}

export interface UpsertSectionInput {
  tenantId: string;
  key: string;
  title: string;
  body: string;
  isPublished: boolean;
  data: Record<string, string>;
  updatedBy?: string;
}

export async function upsertSiteSection(
  input: UpsertSectionInput,
): Promise<Result<{ key: EditableSectionKey }>> {
  if (!isEditableSectionKey(input.key)) {
    return err("UNKNOWN_SECTION", "That section cannot be edited.");
  }
  const data: Record<string, string> = {};
  for (const field of DATA_FIELDS[input.key]) {
    const value = (input.data[field] ?? "").trim();
    if (!value) continue;
    if (URL_FIELDS.has(field) && !/^https:\/\/\S+$/.test(value)) {
      return err("INVALID_URL", "Links must start with https://");
    }
    data[field] = value;
  }

  await db()
    .insert(siteSections)
    .values({
      tenantId: input.tenantId,
      key: input.key,
      title: input.title.trim() || null,
      body: input.body.trim() || null,
      data,
      isPublished: input.isPublished,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [siteSections.tenantId, siteSections.key],
      set: {
        title: input.title.trim() || null,
        body: input.body.trim() || null,
        data,
        isPublished: input.isPublished,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    });
  return ok({ key: input.key });
}

// ── Attractions (the local guide) ────────────────────────────────────────────

export const ATTRACTION_ZONES = ["walkable", "day_trip"] as const;
export const ATTRACTION_CATEGORIES = [
  "food_drink",
  "nightlife",
  "culture",
  "shopping",
  "health",
  "beach",
  "nature",
  "other",
] as const;

export interface AttractionInput {
  name: string;
  zone: (typeof ATTRACTION_ZONES)[number];
  category: (typeof ATTRACTION_CATEGORIES)[number];
  walkMinutes: number | null;
  driveMinutes: number | null;
  blurb: string;
  mapUrl: string;
  sortOrder: number;
  isPublished: boolean;
}

function validateAttraction(input: AttractionInput): Result<AttractionInput> {
  if (!input.name.trim()) return err("INVALID_NAME", "Give the place a name.");
  if (!ATTRACTION_ZONES.includes(input.zone)) {
    return err("INVALID_ZONE", "Zone must be walkable or a day trip.");
  }
  if (!ATTRACTION_CATEGORIES.includes(input.category)) {
    return err("INVALID_CATEGORY", "Unknown category.");
  }
  if (input.mapUrl && !/^https:\/\/\S+$/.test(input.mapUrl)) {
    return err("INVALID_URL", "Links must start with https://");
  }
  return ok(input);
}

export async function listAttractions(tenantId: string) {
  return db()
    .select()
    .from(attractions)
    .where(eq(attractions.tenantId, tenantId))
    .orderBy(asc(attractions.sortOrder), asc(attractions.name));
}

export async function createAttraction(
  tenantId: string,
  input: AttractionInput,
): Promise<Result<{ id: string }>> {
  const valid = validateAttraction(input);
  if (!valid.ok) return valid;
  const [row] = await db()
    .insert(attractions)
    .values({
      tenantId,
      name: input.name.trim(),
      zone: input.zone,
      category: input.category,
      walkMinutes: input.walkMinutes,
      driveMinutes: input.driveMinutes,
      blurb: input.blurb.trim() || null,
      mapUrl: input.mapUrl.trim() || null,
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
    })
    .returning({ id: attractions.id });
  return ok({ id: row.id });
}

export async function updateAttraction(
  tenantId: string,
  id: string,
  input: AttractionInput,
): Promise<Result<{ updated: boolean }>> {
  const valid = validateAttraction(input);
  if (!valid.ok) return valid;
  const rows = await db()
    .update(attractions)
    .set({
      name: input.name.trim(),
      zone: input.zone,
      category: input.category,
      walkMinutes: input.walkMinutes,
      driveMinutes: input.driveMinutes,
      blurb: input.blurb.trim() || null,
      mapUrl: input.mapUrl.trim() || null,
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
      updatedAt: new Date(),
    })
    .where(and(eq(attractions.id, id), eq(attractions.tenantId, tenantId)))
    .returning({ id: attractions.id });
  if (rows.length === 0) return err("NOT_FOUND", "Attraction not found.");
  return ok({ updated: true });
}

export async function deleteAttraction(
  tenantId: string,
  id: string,
): Promise<Result<{ deleted: boolean }>> {
  const rows = await db()
    .delete(attractions)
    .where(and(eq(attractions.id, id), eq(attractions.tenantId, tenantId)))
    .returning({ id: attractions.id });
  return ok({ deleted: rows.length > 0 });
}
