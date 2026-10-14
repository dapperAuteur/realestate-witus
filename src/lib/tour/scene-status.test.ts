// Ported from wanderlearn-app src/lib/scene-status.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import { planBulkSceneStatus } from "./scene-status";

describe("planBulkSceneStatus", () => {
  const row = (id: string, status: "draft" | "published" | "unpublished", canChange = true) => ({
    id,
    status,
    canChange,
  });

  it("publishes drafts and unpublished scenes, leaves published ones alone", () => {
    const plan = planBulkSceneStatus(
      ["a", "b", "c"],
      [row("a", "draft"), row("b", "unpublished"), row("c", "published")],
      "published",
    );
    expect(plan).toEqual({ changeIds: ["a", "b"], unchanged: 1, skipped: 0 });
  });

  it("unpublishes only published scenes; a draft stays a draft", () => {
    const plan = planBulkSceneStatus(
      ["a", "b", "c"],
      [row("a", "draft"), row("b", "unpublished"), row("c", "published")],
      "unpublished",
    );
    expect(plan).toEqual({ changeIds: ["c"], unchanged: 2, skipped: 0 });
  });

  it("skips scenes the user can't change and ids not found at the destination", () => {
    const plan = planBulkSceneStatus(
      ["mine", "theirs", "elsewhere"],
      [row("mine", "draft"), row("theirs", "draft", false)],
      "published",
    );
    expect(plan).toEqual({ changeIds: ["mine"], unchanged: 0, skipped: 2 });
  });

  it("counts a repeated id once", () => {
    const plan = planBulkSceneStatus(["a", "a"], [row("a", "draft")], "published");
    expect(plan).toEqual({ changeIds: ["a"], unchanged: 0, skipped: 0 });
  });
});
