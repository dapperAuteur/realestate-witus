import { and, asc, eq, inArray } from "drizzle-orm";
import { pgErrorCode } from "@/lib/booking/holds";
import { db } from "@/db";
import {
  amenities,
  mediaAssets,
  roomTypeAmenities,
  roomTypePhotos,
  roomTypes,
  roomUnits,
  unitClaims,
} from "@/db/schema";
import { deliveryUrl } from "@/lib/media/cloudinary";
import { err, ok, type Result } from "@/lib/result";

// Room types with photos (BAM 2026-07-14: "rooms need images and be
// clickable" + research A2). Photos live in Cloudinary via media_assets;
// only status='ready' assets ever render, and every image URL goes through
// deliveryUrl (f_auto/q_auto) — never hand-built.

export interface RoomPhoto {
  photoId: string;
  mediaId: string;
  url: string;
  alt: string;
}

async function photosForRoomTypes(
  roomTypeIds: string[],
  width: number,
): Promise<Map<string, RoomPhoto[]>> {
  if (roomTypeIds.length === 0) return new Map();
  const rows = await db()
    .select({
      photoId: roomTypePhotos.id,
      roomTypeId: roomTypePhotos.roomTypeId,
      sortOrder: roomTypePhotos.sortOrder,
      mediaId: mediaAssets.id,
      publicId: mediaAssets.cloudinaryPublicId,
      alt: mediaAssets.altText,
    })
    .from(roomTypePhotos)
    .innerJoin(mediaAssets, eq(roomTypePhotos.mediaId, mediaAssets.id))
    .where(
      and(
        inArray(roomTypePhotos.roomTypeId, roomTypeIds),
        eq(mediaAssets.status, "ready"),
      ),
    )
    .orderBy(asc(roomTypePhotos.sortOrder));
  const byType = new Map<string, RoomPhoto[]>();
  for (const row of rows) {
    const url = deliveryUrl(row.publicId, { width });
    if (!url) continue;
    const list = byType.get(row.roomTypeId) ?? [];
    list.push({ photoId: row.photoId, mediaId: row.mediaId, url, alt: row.alt ?? "" });
    byType.set(row.roomTypeId, list);
  }
  return byType;
}

/** First photo per room type, for cards on the homepage and search results. */
export async function thumbnailsForRoomTypes(
  roomTypeIds: string[],
): Promise<Map<string, RoomPhoto>> {
  const all = await photosForRoomTypes(roomTypeIds, 640);
  return new Map(
    [...all.entries()].flatMap(([id, list]) =>
      list[0] ? [[id, list[0]] as const] : [],
    ),
  );
}

export async function getRoomTypeBySlug(tenantId: string, slug: string) {
  const [roomType] = await db()
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.tenantId, tenantId),
        eq(roomTypes.slug, slug),
        eq(roomTypes.isActive, true),
      ),
    )
    .limit(1);
  if (!roomType) return null;

  const [photos, amenityRows] = await Promise.all([
    photosForRoomTypes([roomType.id], 1280),
    db()
      .select({ name: amenities.name })
      .from(roomTypeAmenities)
      .innerJoin(amenities, eq(roomTypeAmenities.amenityId, amenities.id))
      .where(
        and(eq(roomTypeAmenities.roomTypeId, roomType.id), eq(amenities.isActive, true)),
      )
      .orderBy(asc(amenities.sortOrder)),
  ]);
  return {
    ...roomType,
    photos: photos.get(roomType.id) ?? [],
    amenities: amenityRows.map((a) => a.name),
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listRoomTypesWithPhotos(tenantId: string) {
  const types = await db()
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.tenantId, tenantId))
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name));
  const [photos, units] = await Promise.all([
    photosForRoomTypes(
      types.map((t) => t.id),
      320,
    ),
    types.length > 0
      ? db()
          .select()
          .from(roomUnits)
          .where(
            inArray(
              roomUnits.roomTypeId,
              types.map((t) => t.id),
            ),
          )
          .orderBy(asc(roomUnits.unitNumber))
      : Promise.resolve([]),
  ]);
  const unitsByType = new Map<string, typeof units>();
  for (const unit of units) {
    const list = unitsByType.get(unit.roomTypeId) ?? [];
    list.push(unit);
    unitsByType.set(unit.roomTypeId, list);
  }
  return types.map((t) => ({
    ...t,
    photos: photos.get(t.id) ?? [],
    units: unitsByType.get(t.id) ?? [],
  }));
}

function slugifyRoom(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "room"
  );
}

export async function createRoomType(
  tenantId: string,
  input: RoomTypeEdit,
): Promise<Result<{ id: string }>> {
  if (!input.name.trim()) return err("INVALID_NAME", "Give the room a name.");
  if (!Number.isInteger(input.baseRateMinor) || input.baseRateMinor <= 0) {
    return err("INVALID_RATE", "Base rate must be a positive pesewa amount.");
  }
  const base = slugifyRoom(input.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      const [row] = await db()
        .insert(roomTypes)
        .values({
          tenantId,
          slug,
          name: input.name.trim(),
          description: input.description.trim() || null,
          baseRateMinor: input.baseRateMinor,
          maxOccupancy: input.maxOccupancy,
          bedConfig: input.bedConfig.trim() || null,
          sizeSqm: input.sizeSqm,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        })
        .returning({ id: roomTypes.id });
      return ok({ id: row.id });
    } catch (error) {
      if (pgErrorCode(error) !== "23505" || attempt === 3) throw error;
    }
  }
  return err("GENERIC", "Could not create the room type.");
}

export async function addUnit(
  tenantId: string,
  roomTypeId: string,
  unitNumber: string,
  floor: string,
): Promise<Result<{ id: string }>> {
  const number = unitNumber.trim();
  if (!number) return err("INVALID_UNIT", "Give the unit a number or name.");
  const [roomType] = await db()
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.tenantId, tenantId)))
    .limit(1);
  if (!roomType) return err("NOT_FOUND", "Room type not found.");
  try {
    const [row] = await db()
      .insert(roomUnits)
      .values({ tenantId, roomTypeId, unitNumber: number, floor: floor.trim() || null })
      .returning({ id: roomUnits.id });
    return ok({ id: row.id });
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return err("UNIT_EXISTS", "That unit number already exists for this room type.");
    }
    throw error;
  }
}

export async function setUnitActive(
  tenantId: string,
  unitId: string,
  isActive: boolean,
): Promise<Result<{ updated: boolean }>> {
  const rows = await db()
    .update(roomUnits)
    .set({ isActive })
    .where(and(eq(roomUnits.id, unitId), eq(roomUnits.tenantId, tenantId)))
    .returning({ id: roomUnits.id });
  if (rows.length === 0) return err("NOT_FOUND", "Unit not found.");
  return ok({ updated: true });
}

/**
 * Deleting a unit cascades its claims (= booking history), so deletion is
 * allowed ONLY for units that never held a claim; otherwise deactivate.
 */
export async function deleteUnitIfClean(
  tenantId: string,
  unitId: string,
): Promise<Result<{ deleted: boolean }>> {
  const [claim] = await db()
    .select({ id: unitClaims.id })
    .from(unitClaims)
    .where(eq(unitClaims.unitId, unitId))
    .limit(1);
  if (claim) {
    return err("UNIT_HAS_HISTORY", "This unit has booking history. Deactivate it instead.");
  }
  const rows = await db()
    .delete(roomUnits)
    .where(and(eq(roomUnits.id, unitId), eq(roomUnits.tenantId, tenantId)))
    .returning({ id: roomUnits.id });
  return ok({ deleted: rows.length > 0 });
}

export interface RoomTypeEdit {
  name: string;
  description: string;
  baseRateMinor: number;
  maxOccupancy: number;
  bedConfig: string;
  sizeSqm: number | null;
  sortOrder: number;
  isActive: boolean;
}

export async function updateRoomType(
  tenantId: string,
  roomTypeId: string,
  input: RoomTypeEdit,
): Promise<Result<{ updated: boolean }>> {
  if (!input.name.trim()) return err("INVALID_NAME", "Give the room a name.");
  if (!Number.isInteger(input.baseRateMinor) || input.baseRateMinor <= 0) {
    return err("INVALID_RATE", "Base rate must be a positive pesewa amount.");
  }
  if (!Number.isInteger(input.maxOccupancy) || input.maxOccupancy < 1 || input.maxOccupancy > 12) {
    return err("INVALID_OCCUPANCY", "Occupancy must be 1-12.");
  }
  const rows = await db()
    .update(roomTypes)
    .set({
      name: input.name.trim(),
      description: input.description.trim() || null,
      baseRateMinor: input.baseRateMinor,
      maxOccupancy: input.maxOccupancy,
      bedConfig: input.bedConfig.trim() || null,
      sizeSqm: input.sizeSqm,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.tenantId, tenantId)))
    .returning({ id: roomTypes.id });
  if (rows.length === 0) return err("NOT_FOUND", "Room type not found.");
  return ok({ updated: true });
}

/** Links an uploaded (ready) asset to a room type; tenant-guarded both sides. */
export async function attachRoomPhoto(
  tenantId: string,
  roomTypeId: string,
  mediaId: string,
): Promise<Result<{ photoId: string }>> {
  const [roomType] = await db()
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.tenantId, tenantId)))
    .limit(1);
  const [asset] = await db()
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.tenantId, tenantId)))
    .limit(1);
  if (!roomType || !asset) return err("NOT_FOUND", "Room or photo not found.");
  const [row] = await db()
    .insert(roomTypePhotos)
    .values({ roomTypeId, mediaId })
    .returning({ id: roomTypePhotos.id });
  return ok({ photoId: row.id });
}

export async function removeRoomPhoto(
  tenantId: string,
  photoId: string,
): Promise<Result<{ removed: boolean }>> {
  // Guard through the room type's tenant; the asset row stays (reusable).
  const rows = await db()
    .delete(roomTypePhotos)
    .where(
      and(
        eq(roomTypePhotos.id, photoId),
        inArray(
          roomTypePhotos.roomTypeId,
          db()
            .select({ id: roomTypes.id })
            .from(roomTypes)
            .where(eq(roomTypes.tenantId, tenantId)),
        ),
      ),
    )
    .returning({ id: roomTypePhotos.id });
  return ok({ removed: rows.length > 0 });
}
