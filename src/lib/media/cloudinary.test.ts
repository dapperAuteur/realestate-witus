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

describe("renameImage and destroyImage", () => {
  const capture = (reply: Record<string, unknown>) => {
    const calls: { url: string; fields: Record<string, string> }[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      calls.push({ url: String(url), fields: Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) });
      return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    return { calls, fake };
  };

  it("renames with invalidation, signing every field but api_key", async () => {
    const { renameImage } = await import("./cloudinary");
    const { calls, fake } = capture({ public_id: "t/new" });
    expect(await renameImage("t/old", "t/new", fake)).toEqual({ ok: true });
    expect(calls[0].url).toMatch(/\/image\/rename$/);
    const { signature, api_key, ...signed } = calls[0].fields;
    expect(signed).toMatchObject({ from_public_id: "t/old", to_public_id: "t/new", invalidate: "true" });
    expect(api_key).toBe(process.env.CLOUDINARY_API_KEY);
    expect(signature).toBe(signParams(signed, process.env.CLOUDINARY_API_SECRET as string));
  });

  it("treats an unconfirmed rename as a failure", async () => {
    const { renameImage } = await import("./cloudinary");
    expect((await renameImage("t/old", "t/new", capture({ public_id: "t/old" }).fake)).ok).toBe(false);
  });

  it("destroys with invalidation; an already missing image counts as gone", async () => {
    const { destroyImage } = await import("./cloudinary");
    const ok = capture({ result: "ok" });
    expect(await destroyImage("t/x", ok.fake)).toEqual({ ok: true });
    expect(ok.calls[0]).toMatchObject({ url: expect.stringMatching(/\/image\/destroy$/), fields: { public_id: "t/x", invalidate: "true" } });
    expect((await destroyImage("t/x", capture({ result: "not found" }).fake)).ok).toBe(true);
    expect((await destroyImage("t/x", capture({ result: "error" }).fake)).ok).toBe(false);
  });
});
