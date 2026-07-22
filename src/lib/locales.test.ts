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
});
