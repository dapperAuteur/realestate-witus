import { describe, expect, it } from "vitest";
import { roleSatisfies } from "./rbac";

describe("roleSatisfies", () => {
  it("staff hierarchy: owner covers manager covers agent", () => {
    expect(roleSatisfies("owner", "agent")).toBe(true);
    expect(roleSatisfies("owner", "manager")).toBe(true);
    expect(roleSatisfies("manager", "agent")).toBe(true);
    expect(roleSatisfies("agent", "manager")).toBe(false);
    expect(roleSatisfies("manager", "owner")).toBe(false);
  });

  it("every role satisfies itself", () => {
    expect(roleSatisfies("owner", "owner")).toBe(true);
    expect(roleSatisfies("manager", "manager")).toBe(true);
    expect(roleSatisfies("agent", "agent")).toBe(true);
  });
});
