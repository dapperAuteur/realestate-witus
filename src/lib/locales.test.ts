import { describe, expect, it } from "vitest";
import { localeRedirectTarget } from "./locales";

describe("localeRedirectTarget", () => {
  it("sends the bare domain to the default locale", () => {
    expect(localeRedirectTarget("/")).toBe("/en");
  });

  it("prefixes locale-less paths and preserves them", () => {
    expect(localeRedirectTarget("/rooms")).toBe("/en/rooms");
    expect(localeRedirectTarget("/platform")).toBe("/en/platform");
  });

  it("passes through already-localized, api, internal, and file paths", () => {
    expect(localeRedirectTarget("/en")).toBeNull();
    expect(localeRedirectTarget("/en/rooms")).toBeNull();
    expect(localeRedirectTarget("/api/health")).toBeNull();
    expect(localeRedirectTarget("/_next/static/chunk.js")).toBeNull();
    expect(localeRedirectTarget("/brand/witus/favicon.svg")).toBeNull();
  });

  it("passes through the PostHog ingest proxy so analytics is never redirected", () => {
    // Regression guard. /ingest/* is rewritten to PostHog in next.config.ts, but
    // middleware runs before rewrites: a locale redirect here turns "/ingest/e/" into
    // "/en/ingest/e/", which matches no rewrite and 404s, silently losing every event.
    // The extension-less paths are the ones at risk — array.js escapes on its own.
    expect(localeRedirectTarget("/ingest/e/")).toBeNull();
    expect(localeRedirectTarget("/ingest/flags/")).toBeNull();
    expect(localeRedirectTarget("/ingest/static/array.js")).toBeNull();
  });
});
