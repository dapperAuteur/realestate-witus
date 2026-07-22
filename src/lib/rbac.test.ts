import { describe, expect, it } from "vitest";
import { roleSatisfies } from "./rbac";

describe("roleSatisfies", () => {
  it("staff hierarchy: owner covers manager covers front_desk", () => {
    expect(roleSatisfies("owner", "front_desk")).toBe(true);
    expect(roleSatisfies("owner", "manager")).toBe(true);
    expect(roleSatisfies("manager", "front_desk")).toBe(true);
    expect(roleSatisfies("front_desk", "manager")).toBe(false);
    expect(roleSatisfies("manager", "owner")).toBe(false);
  });

  it("partner and guest are lanes, never implied by staff roles", () => {
    expect(roleSatisfies("owner", "partner")).toBe(false);
    expect(roleSatisfies("owner", "guest")).toBe(false);
    expect(roleSatisfies("partner", "partner")).toBe(true);
    expect(roleSatisfies("partner", "front_desk")).toBe(false);
    expect(roleSatisfies("guest", "guest")).toBe(true);
  });
});
