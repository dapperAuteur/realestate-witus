// Ported from wanderlearn-app src/lib/scene-status.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * Pure rules for changing scene status in bulk. No DB, no "server-only", so
 * the decision the bulk action makes is unit-testable on its own.
 */

export type SceneStatus = "draft" | "published" | "unpublished";

export type BulkStatusPlan = {
  /** Ids whose status will change. */
  changeIds: string[];
  /** Allowed, but already in the requested state (or a draft, on unpublish). */
  unchanged: number;
  /** Requested but not found at this destination, or not this user's to change. */
  skipped: number;
};

/**
 * Decides which of the requested scenes a bulk publish or unpublish changes.
 *
 * `rows` are the scenes found at the destination (a stray id from elsewhere is
 * simply absent). Publishing changes anything not yet published, drafts
 * included. Unpublishing only touches published scenes: a draft stays a draft,
 * matching unpublishScene.
 */
export function planBulkSceneStatus(
  requestedIds: string[],
  rows: { id: string; status: SceneStatus; canChange: boolean }[],
  target: "published" | "unpublished",
): BulkStatusPlan {
  const requested = new Set(requestedIds);
  const allowed = rows.filter((row) => requested.has(row.id) && row.canChange);
  const changeIds = allowed
    .filter((row) => (target === "published" ? row.status !== "published" : row.status === "published"))
    .map((row) => row.id);
  return {
    changeIds,
    unchanged: allowed.length - changeIds.length,
    skipped: requested.size - allowed.length,
  };
}
