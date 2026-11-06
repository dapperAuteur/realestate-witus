import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Error pages keep the app shell (witus docs/shared-ui-ux-dx.md): an unmatched URL under /[lang]
 * must render [lang]/not-found.tsx inside the [lang] layout (header + Sign in), not the bare root
 * not-found. These checks fail if the catch-all goes away or the 404 drops its footer or links.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

describe("error pages keep the app shell", () => {
  it("unmatched /[lang] URLs reach the [lang] not-found through a catch-all", () => {
    expect(read("src/app/[lang]/[...missing]/page.tsx")).toMatch(/notFound\(\)/);
  });

  it("the [lang] 404 renders the platform footer, a home link and a Sign in link", () => {
    const src = read("src/app/[lang]/not-found.tsx");
    expect(src).toContain("<NotFoundFooter />");
    expect(src).toMatch(/href="\/"/);
    expect(src).toMatch(/Sign in/);
    expect(src.match(/<h1/g)).toHaveLength(1);
  });

  it("global-error carries its own home and Sign in links", () => {
    const src = read("src/app/global-error.tsx");
    expect(src).toMatch(/href="\/"/);
    expect(src).toMatch(/href="\/en\/sign-in"/);
  });
});
