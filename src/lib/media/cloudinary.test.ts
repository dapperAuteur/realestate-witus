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

describe("transformedUrl", () => {
  it("chains components as path segments, tail last", async () => {
    const { transformedUrl } = await import("./cloudinary");
    expect(transformedUrl("t/pano", ["e_blur_faces:1500", "e_pixelate_region:40,x_1,y_2,w_3,h_4"], ["q_90"])).toBe(
      `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/e_blur_faces:1500/e_pixelate_region:40,x_1,y_2,w_3,h_4/q_90/t/pano`,
    );
    expect(transformedUrl("t/pano", [])).toBe(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/t/pano`);
  });
});

describe("waitForDerived", () => {
  it("polls while Cloudinary says it is still working, then succeeds", async () => {
    const { waitForDerived } = await import("./cloudinary");
    const statuses = [423, 423, 200];
    const fetchImpl = (async () => new Response(null, { status: statuses.shift() })) as unknown as typeof fetch;
    expect(await waitForDerived("https://x", { deadlineMs: 5000, intervalMs: 1, fetchImpl })).toEqual({ ok: true });
  });

  it("reports Cloudinary's own error", async () => {
    const { waitForDerived } = await import("./cloudinary");
    const fetchImpl = (async () => new Response(null, { status: 400, headers: { "x-cld-error": "Invalid region" } })) as unknown as typeof fetch;
    expect(await waitForDerived("https://x", { deadlineMs: 5000, intervalMs: 1, fetchImpl })).toEqual({ ok: false, error: "Invalid region" });
  });
});
