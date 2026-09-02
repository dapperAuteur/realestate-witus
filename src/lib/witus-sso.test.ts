import { describe, expect, it } from "vitest";
import {
  brandedHostFrom,
  shouldShowWitusSignIn,
  showWitusSignIn,
  witusEcosystemEnabled,
} from "./witus-sso";

// The gate that keeps "Sign in with WitUS" off agency tenant domains. A false positive
// here redirects an agency's buyers to accounts.witus.online and reveals the shared
// backend, so every uncertain input must fail closed.

const base = {
  hasCredentials: true,
  brandedHost: "realestate.witus.online",
  requestHost: "realestate.witus.online",
  tenantOutcome: "platform" as const,
};

describe("brandedHostFrom", () => {
  it("takes the host from BETTER_AUTH_URL, normalized", () => {
    expect(brandedHostFrom("https://realestate.witus.online")).toBe("realestate.witus.online");
    expect(brandedHostFrom("https://RealEstate.WitUS.online/")).toBe("realestate.witus.online");
    expect(brandedHostFrom("http://localhost:3000")).toBe("localhost");
  });

  it("returns null for missing or malformed values so callers fail closed", () => {
    expect(brandedHostFrom(undefined)).toBeNull();
    expect(brandedHostFrom("")).toBeNull();
    expect(brandedHostFrom("realestate.witus.online")).toBeNull(); // no scheme, not a URL
  });
});

describe("shouldShowWitusSignIn", () => {
  it("shows on the branded host serving the PLATFORM tenant", () => {
    // THE CASE THAT DIVERGES FROM STAY.WITUS. scripts/seed-tenants.ts registers
    // realestate.witus.online itself as a tenant domain, owned by the seeded platform
    // tenant (flags.platform: true). Stay.WitUS seeds no such row, so its gate can
    // require "no tenant at all"; porting that rule verbatim would hide the button on
    // the one host it exists for, the moment the platform tenant is seeded.
    expect(shouldShowWitusSignIn(base)).toBe(true);
  });

  it("shows on the branded host before any tenant is seeded", () => {
    // A fresh deploy with no database or an unseeded one resolves no tenant at all.
    expect(shouldShowWitusSignIn({ ...base, tenantOutcome: "none" })).toBe(true);
  });

  it("ignores case and port when comparing hosts", () => {
    expect(shouldShowWitusSignIn({ ...base, requestHost: "RealEstate.witus.online" })).toBe(true);
    expect(shouldShowWitusSignIn({ ...base, requestHost: "realestate.witus.online:443" })).toBe(
      true,
    );
    expect(shouldShowWitusSignIn({ ...base, requestHost: "realestate.witus.online." })).toBe(true);
  });

  it("HIDES on an agency tenant domain — the white-label rule", () => {
    expect(shouldShowWitusSignIn({ ...base, requestHost: "www.bamrealty.com" })).toBe(false);
    expect(shouldShowWitusSignIn({ ...base, requestHost: "demo.realestate.witus.online" })).toBe(
      false,
    );
  });

  it("HIDES when a CUSTOMER tenant resolves on the branded host", () => {
    // Defends the case where the branded host is pointed at an agency tenant: the
    // button must vanish rather than appear on a white-labelled page. Note this is the
    // `tenant` outcome specifically, not `platform` — the two are not interchangeable.
    expect(shouldShowWitusSignIn({ ...base, tenantOutcome: "tenant" })).toBe(false);
  });

  it("HIDES when the tenant lookup failed, rather than assuming no tenant", () => {
    expect(shouldShowWitusSignIn({ ...base, tenantOutcome: "unknown" })).toBe(false);
  });

  it("HIDES without client credentials", () => {
    expect(shouldShowWitusSignIn({ ...base, hasCredentials: false })).toBe(false);
  });

  it("HIDES when the branded host is unknown, so a bad BETTER_AUTH_URL cannot open it up", () => {
    expect(shouldShowWitusSignIn({ ...base, brandedHost: null })).toBe(false);
  });

  it("HIDES when the request carries no Host header", () => {
    expect(shouldShowWitusSignIn({ ...base, requestHost: null })).toBe(false);
  });

  it("a near-miss hostname does not pass — exact match only, no suffix logic", () => {
    for (const host of [
      "realestate.witus.online.evil.com",
      "notrealestate.witus.online",
      "realestate.witus.onlin",
      "realestate-witus.online",
      "realestate.witus.online.",  // trailing dot is normalized, but with a suffix after
      "xrealestate.witus.online",
    ]) {
      const shown = shouldShowWitusSignIn({ ...base, requestHost: host });
      // The trailing-dot form IS the branded host after normalization; every other
      // near miss must fail. Asserted this way so the list can grow without a special
      // case for the one legitimate variant.
      expect(shown).toBe(host === "realestate.witus.online.");
    }
  });

  it("does not treat a *.vercel.app preview as branded", () => {
    // isPlatformHost() (src/lib/platform-host.ts) DOES match these, deliberately, for
    // the landing page. This gate must not: the IdP exact-matches redirect URIs, so a
    // preview would render a button that can only 400, and every extra admitted host is
    // one more way an agency domain slips in.
    expect(shouldShowWitusSignIn({ ...base, requestHost: "realestate-witus.vercel.app" })).toBe(
      false,
    );
  });

  it("hides for an unrecognised tenant outcome — allow-list, not deny-list", () => {
    // A future outcome value nobody thought about here is refused rather than admitted.
    expect(
      shouldShowWitusSignIn({
        ...base,
        tenantOutcome: "something-new" as unknown as typeof base.tenantOutcome,
      }),
    ).toBe(false);
  });
});

describe("witusEcosystemEnabled", () => {
  it("IS showWitusSignIn — one gate, not two that can drift apart", () => {
    // Three surfaces cross to accounts.witus.online: the sign-in button, the silent
    // "Continue as ..." probe, and global sign-out. They read the gate under two names
    // because "showWitusSignIn" does not describe a logout redirect, but they must never
    // become two implementations: the failure mode is someone tightening one host check
    // and leaving the other, so an agency's staff stop seeing the button but still get
    // redirected to the IdP on sign-out. Identity, not equivalence, is what rules that out.
    expect(witusEcosystemEnabled).toBe(showWitusSignIn);
  });
});
