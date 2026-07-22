import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signParams } from "./cloudinary";

describe("signParams", () => {
  it("SHA-1 over alphabetically sorted params with the secret appended", () => {
    const signature = signParams(
      { timestamp: 1315060510, folder: "stay-witus/t1" },
      "abcd",
    );
    const expected = createHash("sha1")
      .update("folder=stay-witus/t1&timestamp=1315060510abcd")
      .digest("hex");
    expect(signature).toBe(expected);
  });

  it("changes when any param changes (no silent reuse across folders)", () => {
    const a = signParams({ timestamp: 1, folder: "stay-witus/a" }, "s");
    const b = signParams({ timestamp: 1, folder: "stay-witus/b" }, "s");
    expect(a).not.toBe(b);
  });
});
