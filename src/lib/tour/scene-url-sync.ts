// Ported from wanderlearn-app src/lib/scene-url-sync.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * Keeping the browser URL on the scene the visitor is actually looking at.
 *
 * Two things were broken and they are the same thing: refreshing a tour threw
 * you back to the start, and the address bar always described the opening
 * scene no matter how far you had walked.
 *
 * `?scene=` is already read server-side on first load, so putting the current
 * scene there fixes the refresh, makes the address bar a correct share link,
 * and turns the back button into "previous scene, then previous page" — all
 * from one mechanism.
 *
 * This module is the decision logic only: what URL, and push or replace. It
 * touches no browser API so the rules can be tested without a DOM.
 */

export type SceneUrlSyncMode = "push" | "replace";

export type SceneUrlAction =
  | { kind: "none" }
  | { kind: "push"; url: string }
  | { kind: "replace"; url: string };

/**
 * What to do with the URL now that the visitor is standing in `sceneId`.
 *
 * @param currentUrl  the full current location
 * @param sceneId     the scene just arrived in
 * @param mode        "push" adds history entries so Back walks scenes;
 *                    "replace" never does. The embed uses "replace" — an
 *                    iframe shares the top window's history, so a partner's
 *                    Back button would otherwise walk our scenes instead of
 *                    leaving their page.
 * @param hasSynced   whether this viewer has written the URL before
 */
export function planSceneUrl(
  currentUrl: string,
  sceneId: string,
  mode: SceneUrlSyncMode,
  hasSynced: boolean,
): SceneUrlAction {
  let url: URL;
  try {
    url = new URL(currentUrl);
  } catch {
    return { kind: "none" };
  }

  // Already correct. Matters more than it looks: this is the case when a
  // visitor picked a scene from the chooser grid and the router navigated to
  // `?scene=<id>` itself. Writing again would replace that history entry and
  // the chooser would stop being reachable with Back.
  if (url.searchParams.get("scene") === sceneId) return { kind: "none" };

  url.searchParams.set("scene", sceneId);

  // The opening scene replaces rather than pushes. It is not somewhere the
  // visitor navigated to — pushing it would spend the first Back press
  // going nowhere visible.
  if (mode === "replace" || !hasSynced) {
    return { kind: "replace", url: url.toString() };
  }
  return { kind: "push", url: url.toString() };
}

/**
 * Which scene a popped history entry is asking for.
 *
 * Returns null when the URL names no scene or names one this tour does not
 * have — a hand-edited URL, or a link from a version of the tour where that
 * scene still existed. Callers fall back to the tour's own start scene rather
 * than leaving the viewer somewhere the URL claims but the tour cannot show.
 */
export function sceneFromUrl(currentUrl: string, knownSceneIds: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(currentUrl);
  } catch {
    return null;
  }
  const id = url.searchParams.get("scene");
  if (!id) return null;
  return knownSceneIds.includes(id) ? id : null;
}
