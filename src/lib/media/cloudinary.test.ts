import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signParams } from "./cloudinary";

describe("signParams", () => {
  it("SHA-1 over alphabetically sorted params with the secret appended", () => {
    const signature = signParams(
      { timestamp: 1315060510, folder: "realestate-witus/t1" },
      "abcd",
    );
    const expected = createHash("sha1")
      .update("folder=realestate-witus/t1&timestamp=1315060510abcd")
      .digest("hex");
    expect(signature).toBe(expected);
  });

  it("changes when any param changes (no silent reuse across folders)", () => {
    const a = signParams({ timestamp: 1, folder: "realestate-witus/a" }, "s");
    const b = signParams({ timestamp: 1, folder: "realestate-witus/b" }, "s");
    expect(a).not.toBe(b);
  });
});

describe("limitedUrl", () => {
  it("caps width without ever upscaling", async () => {
    // vitest.setup.ts sets CLOUDINARY_CLOUD_NAME=vitest-cloud when unset.
    const { limitedUrl } = await import("./cloudinary");
    expect(limitedUrl("realestate-witus/t1/pano", 6144)).toBe(
      `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,c_limit,w_6144/realestate-witus/t1/pano`,
    );
  });
});
