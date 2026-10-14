import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, sceneMomentPanoramas, tourScenes } from "@/db/schema";
import { transformedUrl, uploadFromUrl, waitForDerived } from "@/lib/media/cloudinary";
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
  /** Injected in tests; Cloudinary's own endpoints otherwise. */
  fetchImpl?: typeof fetch;
}

export async function applyPrivacyEdit(input: PrivacyEditInput): Promise<Result<{ mediaId: string }>> {
  const { tenantId } = input;
  const target: PrivacyTarget = { sceneId: input.sceneId, momentId: input.momentId };
  const state = await readTarget(tenantId, target);
  if (!state) return err("SCENE_NOT_FOUND", "That room isn't in this listing.");
  if (state.mediaId !== input.currentMediaId) {
    return err("PRIVACY_STALE", "This photo changed since you opened the editor. Reload and try again.");
  }

  const sourceId = state.originalId ?? state.mediaId;
  if (isPrivacyRecipeEmpty(input.recipe)) {
    // Nothing to hide: show the original again.
    await writeTarget(tenantId, target, { mediaId: sourceId, originalId: null, recipe: null });
    return ok({ mediaId: sourceId });
  }

  const [source] = await db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, sourceId)))
    .limit(1);
  if (!source || source.status !== "ready") return err("PRIVACY_SOURCE", "The original photo isn't available.");

  const components = privacyTransformation(input.recipe, {
    imageSize: source.width && source.height ? { width: source.width, height: source.height } : undefined,
  });
  const renderUrl = transformedUrl(source.cloudinaryPublicId, components, ["q_90"]);
  if (!renderUrl) return err("MEDIA_NOT_CONFIGURED", "Media uploads are not configured yet.");
  const rendered = await waitForDerived(renderUrl, { deadlineMs: 60_000, fetchImpl: input.fetchImpl });
  if (!rendered.ok) return err("PRIVACY_RENDER", `Cloudinary couldn't apply the edit: ${rendered.error}`);

  // Same recipe on the same original gives the same name: a retry doesn't pile up copies.
  const hash = createHash("sha256").update(`${source.id}:${JSON.stringify(input.recipe)}`).digest("hex").slice(0, 10);
  const base = source.cloudinaryPublicId.split("/").pop() ?? "pano";
  const uploaded = await uploadFromUrl(renderUrl, `realestate-witus/${tenantId}/${base}-private-${hash}`, input.fetchImpl);
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

  await writeTarget(tenantId, target, { mediaId: asset.id, originalId: source.id, recipe: input.recipe });
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
