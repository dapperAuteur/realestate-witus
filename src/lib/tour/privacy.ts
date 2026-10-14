import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { listingPhotos, mediaAssets, sceneMomentPanoramas, tourFloorPlans, tourScenes } from "@/db/schema";
import { fileSharedWithAnotherTenant } from "@/lib/demo/clone";
import { DEMO_TENANT_SLUG } from "@/lib/demo/seed";
import { ownedReadyMedia } from "@/lib/listings/admin";
import { destroyImage, limitedUrl, renameImage, transformedUrl, uploadFromUrl, waitForDerived } from "@/lib/media/cloudinary";
import { err, ok, type Result } from "@/lib/result";
import { isPrivacyRecipeEmpty, privacyTransformation, type PrivacyRecipe } from "./privacy-edit";

// "Hide people and gear" (plans/08 phase D), ported from Wanderlust's
// privacy-edits action, manual tools only.
//
// The edit is BAKED into its own file: Cloudinary renders the effects from the
// untouched original, and that render is uploaded as a new asset the room then
// shows. A blur added only to the delivery URL would leave the original one
// edit of the address away, which protects nobody. The original is kept beside
// the photo, so every later edit starts from it and an empty recipe restores it.
//
// A target is a room's current photo, or its photo for another time (Before /
// After): same rules, different row.
//
// Out of reach, not only out of sight (2026-10-14). Until its first edit the
// original IS the photo buyers were sent, at an address they may have kept.
// So the first edit moves it to a fresh, unlisted name with the CDN's copies
// invalidated, and that old address stops working. An edited copy that's
// replaced (a new edit, or a restore) is deleted for the same reason: it may
// show what the newer edit hides. "Delete the original" goes one further and
// leaves the edited copy as the only photo.

export interface PrivacyTarget {
  sceneId: string;
  /** Set to edit the room's photo for this time instead of its current photo. */
  momentId?: string | null;
}

interface TargetState {
  sceneName: string;
  listingId: string;
  /** What buyers see now. */
  mediaId: string;
  /** The untouched photo, once an edit has been applied. */
  originalId: string | null;
  recipe: PrivacyRecipe | null;
}

async function readTarget(tenantId: string, target: PrivacyTarget): Promise<TargetState | null> {
  const [scene] = await db()
    .select({
      name: tourScenes.name,
      listingId: tourScenes.listingId,
      panoramaMediaId: tourScenes.panoramaMediaId,
      originalPanoramaMediaId: tourScenes.originalPanoramaMediaId,
      privacyRecipe: tourScenes.privacyRecipe,
    })
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, target.sceneId)))
    .limit(1);
  if (!scene) return null;
  if (!target.momentId) {
    return {
      sceneName: scene.name,
      listingId: scene.listingId,
      mediaId: scene.panoramaMediaId,
      originalId: scene.originalPanoramaMediaId,
      recipe: scene.privacyRecipe,
    };
  }
  const [photo] = await db()
    .select({
      mediaId: sceneMomentPanoramas.mediaId,
      originalMediaId: sceneMomentPanoramas.originalMediaId,
      privacyRecipe: sceneMomentPanoramas.privacyRecipe,
    })
    .from(sceneMomentPanoramas)
    .where(
      and(
        eq(sceneMomentPanoramas.tenantId, tenantId),
        eq(sceneMomentPanoramas.sceneId, target.sceneId),
        eq(sceneMomentPanoramas.momentId, target.momentId),
      ),
    )
    .limit(1);
  if (!photo) return null;
  return {
    sceneName: scene.name,
    listingId: scene.listingId,
    mediaId: photo.mediaId,
    originalId: photo.originalMediaId,
    recipe: photo.privacyRecipe,
  };
}

async function writeTarget(
  tenantId: string,
  target: PrivacyTarget,
  next: { mediaId: string; originalId: string | null; recipe: PrivacyRecipe | null },
): Promise<void> {
  const now = new Date();
  if (!target.momentId) {
    await db()
      .update(tourScenes)
      .set({
        panoramaMediaId: next.mediaId,
        originalPanoramaMediaId: next.originalId,
        privacyRecipe: next.recipe,
        updatedAt: now,
      })
      .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, target.sceneId)));
    return;
  }
  await db()
    .update(sceneMomentPanoramas)
    .set({ mediaId: next.mediaId, originalMediaId: next.originalId, privacyRecipe: next.recipe, updatedAt: now })
    .where(
      and(
        eq(sceneMomentPanoramas.tenantId, tenantId),
        eq(sceneMomentPanoramas.sceneId, target.sceneId),
        eq(sceneMomentPanoramas.momentId, target.momentId),
      ),
    );
}

export interface PrivacyEditInput extends PrivacyTarget {
  tenantId: string;
  /** The photo the editor was showing. If it has moved on, refuse rather than clobber. */
  currentMediaId: string;
  recipe: PrivacyRecipe;
  userId: string;
  /** Delete the untouched original for good; the edited copy becomes the only photo. */
  deleteOriginal?: boolean;
  /** The floor patch the browser painted (bottom mode "patch"): a JPEG data URL. */
  patchDataUrl?: string | null;
  /** The app's own logos (BUILTIN_LOGOS) are for BAM's listings and the demo agency only. */
  allowBuiltinLogo?: boolean;
  /**
   * The demo agency: its copy of BAM's sample listing borrows his Cloudinary
   * files (demo/clone.ts), so a file another tenant also uses is never moved
   * or deleted from here.
   */
  borrowsFiles?: boolean;
  /** Injected in tests; Cloudinary's own endpoints otherwise. */
  fetchImpl?: typeof fetch;
}

/** Whether any row still shows or keeps this file (a room, a time, a listing photo, a floor plan). */
async function mediaInUse(tenantId: string, mediaId: string): Promise<boolean> {
  const checks = await Promise.all([
    db()
      .select({ id: tourScenes.id })
      .from(tourScenes)
      .where(
        and(
          eq(tourScenes.tenantId, tenantId),
          or(
            eq(tourScenes.panoramaMediaId, mediaId),
            eq(tourScenes.originalPanoramaMediaId, mediaId),
            eq(tourScenes.posterMediaId, mediaId),
          ),
        ),
      )
      .limit(1),
    db()
      .select({ id: sceneMomentPanoramas.id })
      .from(sceneMomentPanoramas)
      .where(
        and(
          eq(sceneMomentPanoramas.tenantId, tenantId),
          or(eq(sceneMomentPanoramas.mediaId, mediaId), eq(sceneMomentPanoramas.originalMediaId, mediaId)),
        ),
      )
      .limit(1),
    db()
      .select({ id: listingPhotos.id })
      .from(listingPhotos)
      .where(and(eq(listingPhotos.tenantId, tenantId), eq(listingPhotos.mediaId, mediaId)))
      .limit(1),
    db()
      .select({ id: tourFloorPlans.id })
      .from(tourFloorPlans)
      .where(and(eq(tourFloorPlans.tenantId, tenantId), eq(tourFloorPlans.mediaId, mediaId)))
      .limit(1),
  ]);
  return checks.some((rows) => rows.length > 0);
}

/**
 * Deletes a file nothing uses any more, from Cloudinary and from our records.
 * `keepPublicId` is the file that replaced it: a retried edit can land on the
 * same name, and that one must survive. Best effort: a failed delete leaves
 * the record, so the file is never orphaned without a trace.
 */
async function retire(
  tenantId: string,
  mediaId: string,
  keepPublicId: string | null,
  fetchImpl?: typeof fetch,
  borrowsFiles = false,
) {
  if (await mediaInUse(tenantId, mediaId)) return;
  const [row] = await db()
    .select({ publicId: mediaAssets.cloudinaryPublicId })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, mediaId)))
    .limit(1);
  if (!row) return;
  const borrowed = borrowsFiles && (await fileSharedWithAnotherTenant(tenantId, row.publicId));
  if (row.publicId !== keepPublicId && !borrowed) {
    const gone = await destroyImage(row.publicId, fetchImpl);
    if (!gone.ok) {
      console.error(`[privacy] couldn't delete ${row.publicId}: ${gone.error}`);
      return;
    }
  }
  await db().delete(mediaAssets).where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, mediaId)));
}

/** A painted strip is about 2048 x 341 at most; 900 KB keeps the whole call under the 1 MB action limit. */
const PATCH_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const PATCH_MAX_CHARS = 900_000;

export async function applyPrivacyEdit(input: PrivacyEditInput): Promise<Result<{ mediaId: string }>> {
  // The patch is uploaded, layered in, then deleted, so it never outlives the bake.
  let patchPublicId: string | undefined;
  try {
    return await bake(input, (id) => (patchPublicId = id));
  } finally {
    if (patchPublicId) {
      const gone = await destroyImage(patchPublicId, input.fetchImpl);
      if (!gone.ok) console.error(`[privacy] couldn't delete the patch ${patchPublicId}: ${gone.error}`);
    }
  }
}

async function bake(input: PrivacyEditInput, onPatch: (publicId: string) => void): Promise<Result<{ mediaId: string }>> {
  const { tenantId } = input;
  const target: PrivacyTarget = { sceneId: input.sceneId, momentId: input.momentId };
  const state = await readTarget(tenantId, target);
  if (!state) return err("SCENE_NOT_FOUND", "That room isn't in this listing.");
  if (state.mediaId !== input.currentMediaId) {
    return err("PRIVACY_STALE", "This photo changed since you opened the editor. Reload and try again.");
  }

  const sourceId = state.originalId ?? state.mediaId;
  // The edited copy on show now, if there is one. Whatever happens next replaces it.
  const previousCopy = state.originalId ? state.mediaId : null;
  if (isPrivacyRecipeEmpty(input.recipe)) {
    // Nothing to hide: show the original again.
    await writeTarget(tenantId, target, { mediaId: sourceId, originalId: null, recipe: null });
    if (previousCopy) await retire(tenantId, previousCopy, null, input.fetchImpl, input.borrowsFiles);
    return ok({ mediaId: sourceId });
  }

  const [source] = await db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, sourceId)))
    .limit(1);
  if (!source || source.status !== "ready") return err("PRIVACY_SOURCE", "The original photo isn't available.");

  const patch = input.recipe.bottom.mode === "patch" ? input.recipe.bottom.patch : undefined;
  if (input.recipe.bottom.mode === "patch") {
    const painted = input.patchDataUrl;
    if (!patch || !painted || painted.length > PATCH_MAX_CHARS || !PATCH_DATA_URL.test(painted)) {
      return err("PRIVACY_PATCH", "The floor patch wasn't painted. Reload and try again.");
    }
    if (patch.logoMediaId && !(await ownedReadyMedia(tenantId, [patch.logoMediaId], "logo")).has(patch.logoMediaId)) {
      return err("PRIVACY_PATCH", "That logo isn't in this agency's library.");
    }
    if (patch.builtinLogo && !input.allowBuiltinLogo) {
      return err("PRIVACY_PATCH", "That logo is only for RealEstate.WitUS's own listings. Upload your agency's logo instead.");
    }
  }

  let sourcePublicId = source.cloudinaryPublicId;
  // A borrowed file (the demo's copy of BAM's listing) stays where it is: it's
  // already public, and moving it would break the listing it came from.
  const borrowed = Boolean(input.borrowsFiles) && (await fileSharedWithAnotherTenant(tenantId, sourcePublicId));
  if (!state.originalId && !borrowed) {
    // First edit: move the original away from the address buyers were sent,
    // before anything else, so a failure here changes nothing.
    const hidden = `realestate-witus/${tenantId}/original-${randomBytes(12).toString("hex")}`;
    const moved = await renameImage(sourcePublicId, hidden, input.fetchImpl);
    if (!moved.ok) {
      return err("PRIVACY_MOVE", `The original couldn't be moved out of reach, so nothing changed: ${moved.error}`);
    }
    await db()
      .update(mediaAssets)
      .set({ cloudinaryPublicId: hidden })
      .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, source.id)));
    sourcePublicId = hidden;
  }

  let patchPublicId: string | undefined;
  if (patch && input.patchDataUrl) {
    // Named by content, so a retry reuses it rather than storing it twice.
    const hash = createHash("sha256").update(input.patchDataUrl).digest("hex").slice(0, 16);
    const uploaded = await uploadFromUrl(input.patchDataUrl, `realestate-witus/${tenantId}/privacy-patches/${hash}`, input.fetchImpl);
    if (!uploaded.ok) return err("PRIVACY_PATCH", `The floor patch couldn't be uploaded: ${uploaded.error}`);
    patchPublicId = uploaded.data.publicId;
    onPatch(patchPublicId);
  }

  const components = privacyTransformation(input.recipe, {
    imageSize: source.width && source.height ? { width: source.width, height: source.height } : undefined,
    patchPublicId,
  });
  const renderUrl = transformedUrl(sourcePublicId, components, ["q_90"]);
  if (!renderUrl) return err("MEDIA_NOT_CONFIGURED", "Media uploads are not configured yet.");
  const rendered = await waitForDerived(renderUrl, { deadlineMs: 60_000, fetchImpl: input.fetchImpl });
  if (!rendered.ok) return err("PRIVACY_RENDER", `Cloudinary couldn't apply the edit: ${rendered.error}`);

  // Same recipe on the same original gives the same name: a retry doesn't pile up copies.
  // The name must say nothing about the original's: buyers see this address,
  // and "<original>-private-<hash>" was one deleted suffix away from the
  // unedited photo. A hash of our own ids can't be walked back to it.
  const hash = createHash("sha256").update(`${source.id}:${JSON.stringify(input.recipe)}`).digest("hex").slice(0, 16);
  const uploaded = await uploadFromUrl(renderUrl, `realestate-witus/${tenantId}/private-${hash}`, input.fetchImpl);
  if (!uploaded.ok) return err("PRIVACY_UPLOAD", uploaded.error);

  const [asset] = await db()
    .insert(mediaAssets)
    .values({
      tenantId,
      cloudinaryPublicId: uploaded.data.publicId,
      kind: "panorama",
      width: uploaded.data.width,
      height: uploaded.data.height,
      bytes: uploaded.data.bytes,
      altText: "",
      status: "ready",
      createdBy: input.userId,
    })
    .returning({ id: mediaAssets.id });

  if (input.deleteOriginal) {
    // The copy is the photo now: nothing to edit it back from, so no recipe either.
    await writeTarget(tenantId, target, { mediaId: asset.id, originalId: null, recipe: null });
    await retire(tenantId, source.id, null, input.fetchImpl, input.borrowsFiles);
  } else {
    await writeTarget(tenantId, target, { mediaId: asset.id, originalId: source.id, recipe: input.recipe });
  }
  if (previousCopy) await retire(tenantId, previousCopy, uploaded.data.publicId, input.fetchImpl, input.borrowsFiles);
  return ok({ mediaId: asset.id });
}

/** What the editor needs: the original to draw on, the saved recipe, and the photo now showing. */
export async function privacyEditData(tenantId: string, target: PrivacyTarget) {
  const state = await readTarget(tenantId, target);
  if (!state) return null;
  const [source] = await db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, state.originalId ?? state.mediaId)))
    .limit(1);
  if (!source) return null;
  return {
    sceneName: state.sceneName,
    listingId: state.listingId,
    currentMediaId: state.mediaId,
    edited: Boolean(state.originalId),
    source: { publicId: source.cloudinaryPublicId, width: source.width, height: source.height },
    recipe: state.recipe,
  };
}

/** The agency's logos for the floor patch, newest first. */
export async function patchLogos(tenantId: string): Promise<{ id: string; url: string }[]> {
  const rows = await db()
    .select({ id: mediaAssets.id, publicId: mediaAssets.cloudinaryPublicId })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), sql`${mediaAssets.kind} = 'logo'`, eq(mediaAssets.status, "ready")))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(12);
  return rows.flatMap((row) => {
    // The painter samples at most 512 px.
    const url = limitedUrl(row.publicId, 512);
    return url ? [{ id: row.id, url }] : [];
  });
}

/** The demo agency borrows BAM's files for its copy of his sample listing (demo/clone.ts). */
export function borrowsFiles(tenant: { slug: string }): boolean {
  return tenant.slug === DEMO_TENANT_SLUG;
}

/** BAM's own listings (the platform tenant) and the demo agency may use the app's logos. */
export function builtinLogosAllowed(tenant: { slug: string; flags: { platform?: boolean } }): boolean {
  return Boolean(tenant.flags.platform) || tenant.slug === DEMO_TENANT_SLUG;
}
