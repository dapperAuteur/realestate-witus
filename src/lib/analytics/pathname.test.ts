import { describe, expect, it } from "vitest";
import { REDACTED_SEGMENT, safePathname } from "./pathname";

// The thing under test is a leak guard, so the cases that matter are the ones where a
// credential would otherwise reach PostHog. Real token shape: randomBytes(24) as
// base64url, which is 32 chars of [A-Za-z0-9_-] (src/lib/admin/invites.ts).
const TOKEN = "Xy7nQp2LmR4tVb8KzA1cD3fG5hJ6kN0s";

describe("safePathname", () => {
  it("redacts a staff invite token", () => {
    expect(safePathname(`/en/invite/${TOKEN}`)).toBe(`/en/invite/${REDACTED_SEGMENT}`);
  });

  it("redacts by POSITION, not just by shape", () => {
    // A short or human-looking token must still be redacted under a credential route.
    // Position is the guarantee; shape is only the backstop.
    expect(safePathname("/en/invite/abc123")).toBe(`/en/invite/${REDACTED_SEGMENT}`);
  });

  it("redacts a token-shaped segment under a route nobody listed", () => {
    expect(safePathname(`/en/some-future-flow/${TOKEN}`)).toBe(
      `/en/some-future-flow/${REDACTED_SEGMENT}`,
    );
  });

  it("keeps the route shape so the flow stays attributable", () => {
    const out = safePathname(`/en/invite/${TOKEN}`);
    expect(out.startsWith("/en/invite/")).toBe(true);
    expect(out).not.toContain(TOKEN);
  });

  it("leaves ordinary routes alone", () => {
    for (const path of [
      "/",
      "/en",
      "/en/roadmap",
      "/en/sign-in",
      "/en/admin",
      "/en/admin/design",
      "/en/admin/team",
      "/en/platform/tenants",
      "/en/platform/domains",
    ]) {
      expect(safePathname(path)).toBe(path);
    }
  });

  it("keeps a long hyphenated listing slug — the signal the listing routes will exist for", () => {
    // 26 chars, so a naive length-only rule would eat it. Guards the listings
    // workstream against a redactor that silently swallows its main dimension.
    const path = "/en/listings/riverside-commercial-lot-b";
    expect(safePathname(path)).toBe(path);
  });

  it("keeps a support ticket id, which is an opaque record id and not a secret", () => {
    const path = "/en/admin/support/550e8400-e29b-41d4-a716-446655440000";
    expect(safePathname(path)).toBe(path);
  });

  it("handles trailing slashes and the empty string without throwing", () => {
    // skipTrailingSlashRedirect is on for the /ingest proxy, so both forms are reachable.
    expect(safePathname("/en/roadmap/")).toBe("/en/roadmap/");
    expect(safePathname("")).toBe("");
  });
});
