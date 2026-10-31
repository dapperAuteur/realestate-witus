import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/dictionaries/en.json";
import { PlatformHeader } from "./platform-header";

/**
 * Sign-in control rule (witus docs/shared-ui-ux-dx.md, "Sign-in control"): the
 * header always shows a link named exactly "Sign in" to a signed-out visitor.
 * On 2026-10-30 realestate.witus.online (with stay.witus.online) was one of the
 * two ecosystem apps whose only Sign in link was in the footer. These tests fail
 * if the header loses it again, if the label is renamed, or if the layout stops
 * rendering the header on the platform.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
    href: m[1],
    text: m[2],
  }));
}

describe("PlatformHeader sign-in control", () => {
  it('shows a link named exactly "Sign in" to this app\'s sign-in page when signed out', () => {
    const html = renderToStaticMarkup(PlatformHeader({ lang: "en", dict: en, signedIn: false }));
    expect(html).toMatch(/^<header\b/);
    expect(links(html)).toContainEqual({ href: "/en/sign-in", text: "Sign in" });
  });

  it("keeps the locale in the sign-in href", () => {
    const html = renderToStaticMarkup(PlatformHeader({ lang: "es", dict: en, signedIn: false }));
    expect(links(html)).toContainEqual({ href: "/es/sign-in", text: "Sign in" });
  });

  it("leaves the auth slot to SessionBar when signed in (no second Sign out)", () => {
    const html = renderToStaticMarkup(PlatformHeader({ lang: "en", dict: en, signedIn: true }));
    expect(links(html).map((l) => l.text)).not.toContain("Sign in");
  });

  it("never contacts or links the WitUS IdP (plain link to this app's own page)", () => {
    const html = renderToStaticMarkup(PlatformHeader({ lang: "en", dict: en, signedIn: false }));
    expect(html).not.toContain("accounts.witus.online");
    const src = stripComments(read("src/components/platform-header.tsx"));
    expect(src).not.toMatch(/witus-sign-in-button|witus-sso|silent-sso/);
  });

  it('the dictionary label is exactly "Sign in"', () => {
    expect(en.common.signIn).toBe("Sign in");
  });

  it("the [lang] layout renders PlatformHeader on the platform surface only", () => {
    const layout = stripComments(read("src/app/[lang]/layout.tsx"));
    expect(layout).toMatch(/\{onPlatform \? \(\s*<PlatformHeader\b/);
    expect(layout).toMatch(/signedIn=\{Boolean\(user\)\}/);
    expect(layout).toMatch(/isPlatformHost\(/);
    // Agency tenant pages keep their own header.
    expect(layout).toMatch(/<TenantHeader\b/);
  });
});
