import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaAssets, tourScenes } from "@/db/schema";
import { transformedUrl, uploadFromUrl, waitForDerived } from "@/lib/media/cloudinary";
import { err, ok, type Result } from "@/lib/result";
import { isPrivacyRecipeEmpty, privacyTransformation, type PrivacyRecipe } from "./privacy-edit";

// "Hide people and gear" (plans/08 phase D), ported from Wanderlust's
// privacy-edits action, manual tools only.
//
// The edit is BAKED into its own file: Cloudinary renders the effects from the
// untouched original, and that render is uploaded as a new asset the room then
// shows. A blur added only to the delivery URL would leave the original one
// edit of the address away, which protects nobody. The original is kept on the
// room (original_panorama_media_id), so every later edit starts from it and an
// empty recipe restores it.

export interface PrivacyEditInput {
  tenantId: string;
  sceneId: string;
  /** The photo the editor was showing. If the room has moved on, refuse rather than clobber. */
  currentMediaId: string;
  recipe: PrivacyRecipe;
  userId: string;
  /** Injected in tests; Cloudinary's own endpoints otherwise. */
  fetchImpl?: typeof fetch;
}

export async function applyPrivacyEdit(input: PrivacyEditInput): Promise<Result<{ mediaId: string }>> {
  const { tenantId } = input;
  const [scene] = await db()
    .select()
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, input.sceneId)))
    .limit(1);
  if (!scene) return err("SCENE_NOT_FOUND", "That room isn't in this listing.");
  if (scene.panoramaMediaId !== input.currentMediaId) {
    return err("PRIVACY_STALE", "This room's photo changed since you opened the editor. Reload and try again.");
  }

  const sourceId = scene.originalPanoramaMediaId ?? scene.panoramaMediaId;
  if (isPrivacyRecipeEmpty(input.recipe)) {
    // Nothing to hide: show the original again.
    await db()
      .update(tourScenes)
      .set({ panoramaMediaId: sourceId, originalPanoramaMediaId: null, privacyRecipe: null, updatedAt: new Date() })
      .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, scene.id)));
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

  await db()
    .update(tourScenes)
    .set({
      panoramaMediaId: asset.id,
      originalPanoramaMediaId: source.id,
      privacyRecipe: input.recipe,
      updatedAt: new Date(),
    })
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, scene.id)));
  return ok({ mediaId: asset.id });
}

/** What the editor needs: the original to draw on, the saved recipe, and the photo now showing. */
export async function privacyEditData(tenantId: string, sceneId: string) {
  const [scene] = await db()
    .select()
    .from(tourScenes)
    .where(and(eq(tourScenes.tenantId, tenantId), eq(tourScenes.id, sceneId)))
    .limit(1);
  if (!scene) return null;
  const sourceId = scene.originalPanoramaMediaId ?? scene.panoramaMediaId;
  const [source] = await db()
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, sourceId)))
    .limit(1);
  if (!source) return null;
  return {
    scene,
    source: {
      publicId: source.cloudinaryPublicId,
      width: source.width,
      height: source.height,
    },
    recipe: scene.privacyRecipe,
  };
}
