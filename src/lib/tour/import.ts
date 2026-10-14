import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, withTx } from "@/db";
import { sceneLinks, tourFloorPlans, tourScenes } from "@/db/schema";
import { findOwnedListing, ownedReadyMedia } from "@/lib/listings/admin";
import { err, ok, type Result } from "@/lib/result";
import { parseTourCsv, planImport, roomKey, type TourCsvContext } from "./csv-import";

// Applies a tour spreadsheet (plans/06 surface 1). The browser has already
// shown the preview and uploaded the photos it needs; this re-runs the same
// checks against the listing as it is NOW, then writes everything in one
// transaction, so a failure leaves the tour as it was.
//
// Idempotent: rooms match by name, doorways that exist are skipped, and a room
// already on the listing keeps its photo unless the import was told to replace
// it. Running the same file twice changes nothing the second time.

export interface TourImportInput {
  tenantId: string;
  listingId: string;
  csv: string;
  /** The uploads the browser made for this import, by original filename. */
  photos: { filename: string; mediaId: string }[];
  replacePhotos: boolean;
}

export interface TourImportResult {
  created: number;
  updated: number;
  /** Pairs of rooms newly connected (both directions count once). */
  connected: number;
}

export async function tourCsvContext(tenantId: string, listingId: string) {
  const [scenes, floors] = await Promise.all([
    db()
      .select({
        id: tourScenes.id,
        name: tourScenes.name,
        isStart: tourScenes.isStart,
        floorPlanId: tourScenes.floorPlanId,
        panoramaMediaId: tourScenes.panoramaMediaId,
      })
      .from(tourScenes)
      .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, listingId)))
      .orderBy(asc(tourScenes.createdAt)),
    db()
      .select({ id: tourFloorPlans.id, label: tourFloorPlans.label })
      .from(tourFloorPlans)
      .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.listingId, listingId)))
      .orderBy(asc(tourFloorPlans.sortOrder)),
  ]);
  const context: TourCsvContext = { rooms: scenes.map((s) => s.name), floors: floors.map((f) => f.label) };
  return { scenes, floors, context };
}

export async function importTourCsv(input: TourImportInput): Promise<Result<TourImportResult>> {
  const { tenantId, listingId } = input;
  const listing = await findOwnedListing(tenantId, listingId);
  if (!listing) return err("LISTING_NOT_FOUND", "That listing isn't in this agency.");
  const { scenes, floors, context } = await tourCsvContext(tenantId, listingId);

  const parsed = parseTourCsv(input.csv, context);
  const plan = planImport(parsed, context, input.photos.map((p) => p.filename), { replacePhotos: input.replacePhotos });
  const problem = [...parsed.issues, ...plan.issues][0];
  if (problem) {
    return err(
      "CSV_INVALID",
      problem.line
        ? `The spreadsheet has a problem on line ${problem.line}. Check the preview, fix it, and try again.`
        : "The spreadsheet has a problem. Check the preview, fix it, and try again.",
    );
  }

  const byFile = new Map(input.photos.map((p) => [p.filename.toLowerCase(), p.mediaId]));
  const owned = await ownedReadyMedia(
    tenantId,
    plan.uploads.map((f) => byFile.get(f.toLowerCase()) ?? ""),
    "panorama",
  );
  const mediaFor = (photo: string | null) => {
    const id = photo ? byFile.get(photo.toLowerCase()) : undefined;
    return id && owned.has(id) ? id : null;
  };
  if (plan.uploads.some((f) => !mediaFor(f))) {
    return err("CSV_PHOTOS", "Some photos didn't finish uploading. Pick them again and import again.");
  }

  // Two floors may share a name; the first in floor order wins, as in the editor's list.
  const floorId = new Map<string, string>();
  for (const floor of floors) if (!floorId.has(roomKey(floor.label))) floorId.set(roomKey(floor.label), floor.id);
  const sceneByKey = new Map(scenes.map((s) => [roomKey(s.name), s]));

  return withTx(async (tx) => {
    const ids = new Map(scenes.map((s) => [roomKey(s.name), s.id]));
    const now = Date.now();

    if (plan.create.length) {
      const inserted = await tx
        .insert(tourScenes)
        .values(
          plan.create.map((row, i) => ({
            tenantId,
            listingId,
            name: row.name,
            panoramaMediaId: mediaFor(row.photo)!,
            floorPlanId: row.floor ? (floorId.get(roomKey(row.floor)) ?? null) : null,
            // Spreadsheet order is the tie-breaker wherever rooms sort by creation.
            createdAt: new Date(now + i),
            updatedAt: new Date(now + i),
          })),
        )
        .returning({ id: tourScenes.id, name: tourScenes.name });
      for (const row of inserted) ids.set(roomKey(row.name), row.id);
    }

    let updated = 0;
    for (const row of plan.update) {
      const scene = sceneByKey.get(roomKey(row.name))!;
      const patch: Partial<typeof tourScenes.$inferInsert> = {};
      const floor = row.floor ? floorId.get(roomKey(row.floor)) : undefined;
      if (floor && floor !== scene.floorPlanId) Object.assign(patch, { floorPlanId: floor, mapX: null, mapY: null });
      const media = input.replacePhotos ? mediaFor(row.photo) : null;
      if (media && media !== scene.panoramaMediaId) {
        // A new photo starts clean: the old one's privacy edit doesn't fit it.
        Object.assign(patch, { panoramaMediaId: media, originalPanoramaMediaId: null, privacyRecipe: null });
      }
      if (Object.keys(patch).length === 0) continue;
      await tx
        .update(tourScenes)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, scene.id)));
      updated++;
    }

    let connected = 0;
    if (plan.links.length) {
      const involved = [...new Set(plan.links.flat().map((name) => ids.get(roomKey(name))!))];
      const existing = await tx
        .select({ from: sceneLinks.fromSceneId, to: sceneLinks.toSceneId })
        .from(sceneLinks)
        .where(and(eq(sceneLinks.tenantId, tenantId), inArray(sceneLinks.fromSceneId, involved)));
      const has = new Set(existing.map((link) => `${link.from}|${link.to}`));
      const rows: { fromSceneId: string; toSceneId: string }[] = [];
      for (const [a, b] of plan.links) {
        const [idA, idB] = [ids.get(roomKey(a))!, ids.get(roomKey(b))!];
        const wanted = [
          { fromSceneId: idA, toSceneId: idB },
          { fromSceneId: idB, toSceneId: idA },
        ].filter((link) => !has.has(`${link.fromSceneId}|${link.toSceneId}`));
        if (wanted.length) connected++;
        rows.push(...wanted);
      }
      if (rows.length) {
        // Unplaced, like the Connections editor's: someone clicks where each doorway goes.
        await tx.insert(sceneLinks).values(rows.map((row, i) => ({ tenantId, ...row, createdAt: new Date(now + i) })));
      }
    }

    // The start room: the one the file names, or the first new room on a listing that has none.
    const startId = plan.start
      ? ids.get(roomKey(plan.start))
      : !scenes.some((s) => s.isStart) && plan.create.length
        ? ids.get(roomKey(plan.create[0].name))
        : undefined;
    if (startId && !scenes.some((s) => s.id === startId && s.isStart)) {
      // One start per listing (partial unique index): clear, then set.
      await tx
        .update(tourScenes)
        .set({ isStart: false })
        .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.listingId, listingId), eq(tourScenes.isStart, true)));
      await tx
        .update(tourScenes)
        .set({ isStart: true })
        .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, startId)));
    }

    return ok({ created: plan.create.length, updated, connected });
  });
}
