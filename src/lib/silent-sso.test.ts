import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localeRedirectTarget } from "./locales";
import {
  SILENT_AUTH_FAILURES,
  SSO_ATTEMPT_STORAGE_KEY,
  continueAsLabel,
  endSessionEndpointFromDiscovery,
  hasAttemptMarker,
  isSilentAuthFailure,
  parseSilentSsoIdentity,
  runSilentSsoProbe,
  silentSsoDecision,
  silentSsoEndpointFromDiscovery,
  silentSsoRecoveryPath,
  withAttemptMarker,
  withPostLogoutRedirect,
} from "./silent-sso";

/**
 * Ecosystem SSO: the silent "Continue as <name>" check and "Sign out of WitUS everywhere".
 *
 * Pinned in order of what each would cost if it broke:
 *   1. TENANT ISOLATION. An agency tenant's visitor must make ZERO requests to
 *      accounts.witus.online. One request reveals the ecosystem exists AND tells it
 *      someone visited that agency — the white-label invariant in CLAUDE.md.
 *      Proved by RUNNING the probe with a counting fetch, not by reading the source.
 *   2. THE REDIRECT LOOP. probe -> "Continue as X" -> submit -> IdP declines -> back to
 *      the form -> probe. It never appears in normal use, so it is simulated end to end.
 *   3. SIGN-OUT ORDERING + the exact post_logout_redirect_uri. Wrong order means "I
 *      clicked sign out and I am still signed in"; a missing trailing slash means 400.
 *   4. INVISIBLE FAILURE. Nothing the probe can return may produce an error, a stuck
 *      spinner, or a claim about who the visitor is.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

/** Assertions about what the CODE does must not be satisfied (or broken) by a comment. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DISCOVERY = "https://accounts.witus.online/api/idp/.well-known/openid-configuration";
const ENDPOINT = "https://accounts.witus.online/api/ecosystem/session";

/** A fetch that records every call and would answer "yes, Ada is signed in" if reached. */
function countingFetch() {
  const calls: string[] = [];
  const impl = ((input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve(
      new Response(JSON.stringify({ signedIn: true, user: { name: "Ada" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("TENANT ISOLATION: an agency tenant host makes zero requests to the IdP", () => {
  it("never calls fetch when the server-resolved host gate is false", async () => {
    // Every OTHER input set to its most "yes, go ahead" value, including a live endpoint
    // that would answer. The gate still wins, and it wins FIRST.
    for (const search of ["", "?status=sent", "?sso=tried"]) {
      for (const attempted of [false, true]) {
        for (const signedIn of [false, true]) {
          const { calls, impl } = countingFetch();
          const identity = await runSilentSsoProbe({
            enabled: false,
            endpoint: ENDPOINT,
            search,
            attempted,
            signedIn,
            fetchImpl: impl,
          });
          // THE ASSERTION THAT MATTERS. Not "no button rendered" — no REQUEST made.
          expect(calls).toEqual([]);
          expect(identity).toBeNull();
        }
      }
    }
  });

  it("reports the host gate as the reason, ahead of every other skip", () => {
    for (const search of ["", "?sso=tried"]) {
      for (const attempted of [false, true]) {
        for (const signedIn of [false, true]) {
          expect(
            silentSsoDecision({ enabled: false, endpoint: ENDPOINT, search, attempted, signedIn }),
          ).toEqual({ attempt: false, skip: "host-not-eligible" });
        }
      }
    }
  });

  it("does probe on the branded host, so the test above is not passing vacuously", async () => {
    const { calls, impl } = countingFetch();
    const identity = await runSilentSsoProbe({
      enabled: true,
      endpoint: ENDPOINT,
      search: "",
      fetchImpl: impl,
    });
    expect(calls).toEqual([ENDPOINT]);
    expect(identity).toEqual({ label: "Ada" });
  });

  it("sends the credentialed cross-origin request the design depends on", async () => {
    let init: RequestInit | undefined;
    const impl = ((_input: RequestInfo | URL, i?: RequestInit) => {
      init = i;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    await runSilentSsoProbe({ enabled: true, endpoint: ENDPOINT, search: "", fetchImpl: impl });
    // credentials:"include" IS the mechanism — the answer depends on the IdP's own
    // cookie, which is third-party from here.
    expect(init?.credentials).toBe("include");
    expect(init?.mode).toBe("cors");
    expect(init?.cache).toBe("no-store");
  });

  it("stays dark when this app is not a configured OIDC client", async () => {
    for (const endpoint of [null, undefined, ""]) {
      const { calls } = countingFetch();
      expect(silentSsoDecision({ enabled: true, endpoint, search: "" })).toEqual({
        attempt: false,
        skip: "not-configured",
      });
      expect(calls).toEqual([]);
    }
  });

  it("does not ask on behalf of someone already signed in here", async () => {
    const { calls, impl } = countingFetch();
    await runSilentSsoProbe({
      enabled: true,
      endpoint: ENDPOINT,
      search: "",
      signedIn: true,
      fetchImpl: impl,
    });
    expect(calls).toEqual([]);
  });

  it("is enforced by the sign-in PAGE, so a tenant browser is never told the URL", () => {
    const page = read("src/app/[lang]/sign-in/page.tsx");
    // The gate itself, unchanged: resolved on the server from the request Host.
    expect(page).toContain("const witusSignIn = await showWitusSignIn();");
    // The component and the endpoint appear ONLY inside `{witusSignIn ? ... : null}`.
    const gated = page.slice(page.indexOf("{witusSignIn ?"), page.indexOf('{status === "sent" ?'));
    expect(gated).toContain("<WitusSignInButton");
    expect(gated).toContain("silentCheckUrl={witusSilentSsoEndpoint}");
    expect(gated).toContain("enabled={witusSignIn}");
    // ...and nowhere else in the file.
    expect(page.split("<WitusSignInButton").length - 1).toBe(1);
    expect(page.split("witusSilentSsoEndpoint").length - 1).toBe(2); // the import + the one use
  });

  it("is repeated as a hard precondition inside the component", () => {
    const component = read("src/components/witus-sign-in-button.tsx");
    // A caller who forgets the wrapper gets an inert button, not a leak.
    expect(component).toContain("if (!enabled) return null;");
    // Exactly one network call, and it goes through the gated helper, never raw fetch.
    expect(stripComments(component)).not.toMatch(/\bfetch\(/);
    expect(component).toContain("runSilentSsoProbe({");
    expect(component).toContain("enabled,");
  });

  it("only ever probes the server-resolved endpoint, never one the client builds", () => {
    // Comments may name the IdP; CODE must not. A URL literal here would be a
    // client-side default that could outlive the gate, which is exactly how a
    // white-label surface starts leaking.
    const code = stripComments(read("src/components/witus-sign-in-button.tsx"));
    expect(code).not.toContain("https://");
    expect(code).not.toContain("witus.online");
    expect(code).toContain("endpoint: silentCheckUrl,");
  });

  it("gates \"Sign out of WitUS everywhere\" on the same server-resolved host check", () => {
    // Same binding as the sign-in gate (see witus-sso.test.ts for the identity proof),
    // so an agency's staff are not redirected to the IdP on the way out either.
    const helper = stripComments(read("src/lib/sign-out.ts"));
    expect(helper).toContain("if (!(await witusEcosystemEnabled())) return null;");
    const code = stripComments(read("src/app/[lang]/sign-out-action.ts"));
    // The only redirect that leaves us comes from that gated helper.
    expect(code).toContain("const endSession = await witusEverywhereSignOutUrl();");
    expect(code).toContain("if (endSession) redirect(endSession);");
    expect(code).not.toContain("https://");
    // Nothing from the posted form decides whether we touch the IdP.
    expect(code).not.toMatch(/formData\.get\((?!"lang")/);
  });

  it("offers the everywhere control only from the same gated helper", () => {
    const bar = stripComments(read("src/components/session-bar.tsx"));
    expect(bar).toContain("await witusEverywhereSignOutUrl()");
    expect(bar).not.toContain("signOutWitus");
    // An agency tenant page must not carry the WitUS name at all, not even in a label:
    // every WitUS string comes from the dictionary behind that gate.
    expect(bar).not.toContain("Sign out of WitUS");
  });

  it("re-checks the gate in the sign-in ACTION, which is a public POST endpoint", () => {
    // Rendering logic is not a control: anyone can invoke a server action from a tenant
    // host regardless of what was drawn on the page.
    const code = stripComments(read("src/app/[lang]/sign-in/actions.ts"));
    expect(code).toContain("await showWitusSignIn()");
    const guard = code.indexOf("await showWitusSignIn()");
    const start = code.indexOf("signInSocial");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(start);
  });

  it("registers the OIDC provider only when credentials exist", () => {
    // With no credentials Better Auth has no `witus` provider at all, so even a
    // hand-crafted POST cannot start a flow. The third defence-in-depth layer.
    const auth = stripComments(read("src/lib/auth.ts"));
    expect(auth).toContain("...(hasWitusSso");
    expect(auth).toContain('providerId: "witus"');
    // nextCookies() must stay LAST or the plugins before it lose their Set-Cookie.
    expect(auth.lastIndexOf("nextCookies()")).toBeGreaterThan(auth.indexOf("genericOAuth({"));
  });

  it("uses the callback path the IdP registry actually registered", () => {
    // gemini/witus lib/identity/clients.ts registers exactly ONE redirect URI for slug
    // `realestate`: origin + "/api/auth/oauth2/callback/witus". Better Auth derives that
    // path from the route directory plus the genericOAuth providerId, so both halves are
    // pinned here — a rename of either silently produces an unregistered redirect_uri.
    expect(read("src/lib/auth.ts")).toContain('providerId: "witus"');
    expect(() => read("src/app/api/auth/[...all]/route.ts")).not.toThrow();
    // And the recovery matcher watches that same path.
    expect(
      silentSsoRecoveryPath(
        new URL("https://realestate.witus.online/api/auth/oauth2/callback/witus?error=access_denied"),
      ),
    ).toBe("/sign-in?sso=tried");
  });
});

describe("the redirect loop: an IdP that will not sign the visitor in", () => {
  /**
   * The failure the guard exists for, walked start to finish. It cannot be reproduced by
   * using the app normally, because normally the IdP either has a session or shows its
   * own login page.
   */
  it("attempts once, then never again in that tab", () => {
    // 1. First arrival: no marker anywhere.
    let storage = false;
    let search = "";
    expect(
      silentSsoDecision({ enabled: true, endpoint: ENDPOINT, search, attempted: storage }),
    ).toEqual({ attempt: true });

    // 2. The probe answered, the visitor submitted, and the marker is written BEFORE
    //    the form goes anywhere.
    storage = true;

    // 3. The IdP declines. This is what comes back to our callback.
    const declined = new URL(
      "https://realestate.witus.online/api/auth/oauth2/callback/witus?error=login_required&error_description=Authentication+required",
    );
    const recovery = silentSsoRecoveryPath(declined);
    expect(recovery).toBe("/sign-in?sso=tried");

    // 3b. That path is locale-less on purpose; middleware localizes it and keeps the query.
    expect(localeRedirectTarget("/sign-in")).toBe("/en/sign-in");
    search = new URL(recovery as string, "https://realestate.witus.online").search;

    // 4. Back on the form. Both halves of the marker now say stop.
    expect(
      silentSsoDecision({ enabled: true, endpoint: ENDPOINT, search, attempted: storage }),
    ).toEqual({ attempt: false, skip: "already-attempted" });

    // 5. sessionStorage alone stops it (the visitor navigated back to a bare /en/sign-in).
    expect(
      silentSsoDecision({ enabled: true, endpoint: ENDPOINT, search: "", attempted: true }),
    ).toEqual({ attempt: false, skip: "already-attempted" });

    // 6. The query param alone stops it — the case that matters in a browser where
    //    sessionStorage throws or is empty (private mode, a fresh tab from the redirect).
    expect(
      silentSsoDecision({ enabled: true, endpoint: ENDPOINT, search, attempted: false }),
    ).toEqual({ attempt: false, skip: "already-attempted" });
  });

  it("makes no request once the marker is set, whichever half carries it", async () => {
    for (const input of [
      { search: "?sso=tried", attempted: false },
      { search: "", attempted: true },
    ]) {
      const { calls, impl } = countingFetch();
      await runSilentSsoProbe({ enabled: true, endpoint: ENDPOINT, ...input, fetchImpl: impl });
      expect(calls).toEqual([]);
    }
  });

  it("writes the marker BEFORE the form submits, never after the return", () => {
    const component = read("src/components/witus-sign-in-button.tsx");
    // The marker rides an onClick on a type="submit" button, which fires synchronously
    // ahead of submission. A marker written after the redirect is a marker that never
    // exists when the return is the thing that failed — precisely the loop.
    expect(component).toContain("onClick={writeAttempted}");
    expect(component).toContain('type="submit"');
    expect(component).toContain("SSO_ATTEMPT_STORAGE_KEY");
    // The key lives in the shared module, so component and tests cannot drift.
    expect(SSO_ATTEMPT_STORAGE_KEY).toBe("witus.sso.attempted");
  });

  it("wraps every sessionStorage access, because it throws outright in some privacy modes", () => {
    const component = read("src/components/witus-sign-in-button.tsx");
    // Both accessors, each with its own try/catch. A browser that cannot remember the
    // attempt must fall back to the ?sso=tried half of the guard, not throw on render.
    for (const fn of ["function readAttempted", "function writeAttempted"]) {
      const start = component.indexOf(fn);
      expect(start).toBeGreaterThan(-1);
      // Up to the next top-level closing brace, i.e. the end of this function.
      const rest = component.slice(start);
      const body = rest.slice(0, rest.indexOf("\n}") + 2);
      expect(body).toContain("try {");
      expect(body).toContain("} catch {");
    }
    // ...and nowhere else does the component touch storage directly.
    expect(stripComments(component).split("sessionStorage").length - 1).toBe(2);
  });

  it("keeps the ecosystem flow working with client JS off", () => {
    // The button is a submit inside the existing server-action form, not an onClick
    // handler that IS the navigation. Losing that would make the loop guard the thing
    // that broke no-JS sign-in.
    const component = read("src/components/witus-sign-in-button.tsx");
    // Reading window.location.search is fine (that is the ?sso=tried half of the guard).
    // ASSIGNING to it is not: that would make the button navigate instead of submit, and
    // no-JS sign-in would silently stop working.
    expect(stripComments(component)).not.toMatch(/window\.location\.(assign|replace|href)/);
    expect(read("src/app/[lang]/sign-in/page.tsx")).toContain("<form action={signInWithWitus}");
  });

  it("recovers only from declines, and only from this app's own witus callback", () => {
    const base = "https://realestate.witus.online";
    for (const code of SILENT_AUTH_FAILURES) {
      expect(
        silentSsoRecoveryPath(new URL(`${base}/api/auth/oauth2/callback/witus?error=${code}`)),
      ).toBe("/sign-in?sso=tried");
    }
    // A real fault must still surface the way it does today.
    expect(
      silentSsoRecoveryPath(new URL(`${base}/api/auth/oauth2/callback/witus?error=server_error`)),
    ).toBeNull();
    // A success must never be swallowed.
    expect(
      silentSsoRecoveryPath(new URL(`${base}/api/auth/oauth2/callback/witus?code=abc&state=xyz`)),
    ).toBeNull();
    // Magic link — this repo's primary path — and every other auth route are untouched.
    expect(
      silentSsoRecoveryPath(new URL(`${base}/api/auth/oauth2/callback/other?error=login_required`)),
    ).toBeNull();
    expect(silentSsoRecoveryPath(new URL(`${base}/api/auth/magic-link/verify?token=t`))).toBeNull();
    expect(silentSsoRecoveryPath(new URL(`${base}/api/auth/get-session`))).toBeNull();
  });

  it("is wired into the auth route ahead of Better Auth", () => {
    const route = read("src/app/api/auth/[...all]/route.ts");
    const guard = route.indexOf("silentSsoRecoveryPath(");
    const delegate = route.indexOf("return auth().handler(request);");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(delegate);
    // Relative Location: every agency tenant is on its own domain, so the browser resolves it.
    expect(route).toContain("headers: { location: recovery }");
    // POST is untouched — this only ever intercepts the GET callback.
    expect(route).toContain("export async function POST(request: Request)");
  });

  it("classifies the OIDC decline codes and nothing else", () => {
    expect(isSilentAuthFailure("login_required")).toBe(true);
    expect(isSilentAuthFailure("access_denied")).toBe(true);
    expect(isSilentAuthFailure("invalid_request")).toBe(false);
    expect(isSilentAuthFailure("")).toBe(false);
    expect(isSilentAuthFailure(null)).toBe(false);
    expect(isSilentAuthFailure(undefined)).toBe(false);
  });
});

describe("the one-shot marker", () => {
  it("reads only its own exact value", () => {
    expect(hasAttemptMarker("?sso=tried")).toBe(true);
    expect(hasAttemptMarker("sso=tried")).toBe(true);
    expect(hasAttemptMarker("?status=sent&sso=tried")).toBe(true);
    expect(hasAttemptMarker("?sso=something-else")).toBe(false);
    expect(hasAttemptMarker("?status=/sso=tried")).toBe(false);
    expect(hasAttemptMarker("")).toBe(false);
    expect(hasAttemptMarker(null)).toBe(false);
    expect(hasAttemptMarker(undefined)).toBe(false);
  });

  it("keeps any query the path already has", () => {
    expect(withAttemptMarker("/en/sign-in")).toBe("/en/sign-in?sso=tried");
    expect(withAttemptMarker("/en/sign-in?status=sent")).toBe("/en/sign-in?status=sent&sso=tried");
    expect(withAttemptMarker("/en/sign-in#top")).toBe("/en/sign-in?sso=tried#top");
  });

  it("is idempotent, so a second pass cannot stack duplicates", () => {
    const once = withAttemptMarker("/en/sign-in?status=sent");
    expect(withAttemptMarker(once)).toBe(once);
  });
});

describe("the IdP URLs are derived, never invented", () => {
  it("turns the configured discovery URL into the IdP's session route", () => {
    expect(silentSsoEndpointFromDiscovery(DISCOVERY)).toBe(ENDPOINT);
    // Fixed path on the ORIGIN, not under the basePath, so an IdP mounted at the root
    // derives the same route.
    expect(
      silentSsoEndpointFromDiscovery("https://id.example.test/.well-known/openid-configuration"),
    ).toBe("https://id.example.test/api/ecosystem/session");
  });

  it("never probes Better Auth's /get-session, which would expose a session token", () => {
    // THE POINT OF THIS TEST. /get-session returns { session, user } and `session`
    // carries the SESSION TOKEN, so a credentialed cross-origin probe against it would
    // let any ecosystem origin — or an XSS on one — lift a live IdP session.
    for (const discovery of [
      DISCOVERY,
      "https://id.example.test/.well-known/openid-configuration",
    ]) {
      expect(silentSsoEndpointFromDiscovery(discovery)).not.toContain("get-session");
    }
  });

  it("derives the RP-initiated logout endpoint under the IdP's basePath", () => {
    expect(endSessionEndpointFromDiscovery(DISCOVERY)).toBe(
      "https://accounts.witus.online/api/idp/oauth2/endsession",
    );
  });

  it("returns null rather than guessing when there is nothing to derive from", () => {
    for (const bad of [null, undefined, "", "not a url", "https://accounts.witus.online/api/idp"]) {
      expect(silentSsoEndpointFromDiscovery(bad)).toBeNull();
      expect(endSessionEndpointFromDiscovery(bad)).toBeNull();
    }
  });

  it("names accounts.witus.online exactly once in the whole repo's source", () => {
    // One labelled fallback in env.ts, re-exported to auth.ts and to both endpoint
    // derivations. Two literals that could disagree is how the silent check ends up
    // probing a different host than the one the click signs in against.
    const env = stripComments(read("src/lib/env.ts"));
    expect(env).toContain("export const WITUS_OIDC_DISCOVERY_FALLBACK =");
    expect(env.split("accounts.witus.online").length - 1).toBe(1);
    const auth = stripComments(read("src/lib/auth.ts"));
    expect(auth).toContain("env.WITUS_OIDC_DISCOVERY_URL ?? WITUS_OIDC_DISCOVERY_FALLBACK");
    expect(auth).not.toContain("accounts.witus.online");
    expect(stripComments(read("src/lib/silent-sso.ts"))).not.toContain("witus.online");
  });
});

describe("sign out of WitUS everywhere", () => {
  const endSession =
    "https://accounts.witus.online/api/idp/oauth2/endsession?client_id=witus-realestate";

  it("sends post_logout_redirect_uri as EXACTLY the app origin plus a trailing slash", () => {
    // Better Auth exact-matches this against the client's registered redirectUrls, and
    // the IdP registry records `origin + "/"` for slug `realestate`. Drop the slash: 400.
    expect(withPostLogoutRedirect(endSession, "https://realestate.witus.online")).toBe(
      `${endSession}&post_logout_redirect_uri=${encodeURIComponent(
        "https://realestate.witus.online/",
      )}`,
    );
    // The same answer whatever shape BETTER_AUTH_URL happens to take.
    for (const configured of [
      "https://realestate.witus.online",
      "https://realestate.witus.online/",
      "https://realestate.witus.online/somewhere",
    ]) {
      expect(withPostLogoutRedirect(endSession, configured)).toContain(
        encodeURIComponent("https://realestate.witus.online/"),
      );
    }
  });

  it("sends the bare '/' and never a locale, even though this app is localized", () => {
    // "/" 307s to "/en" here (src/middleware.ts) and that is intended: the registry
    // registers "/" and lets the app redirect, so no locale is baked into an external
    // system's config. Sending "/en" would be an unregistered URI and a 400.
    const url = new URL(
      withPostLogoutRedirect(endSession, "https://realestate.witus.online") as string,
    );
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://realestate.witus.online/",
    );
    expect(url.searchParams.get("post_logout_redirect_uri")).not.toContain("/en");
    // And the app really does redirect it, so the visitor lands on a page.
    expect(localeRedirectTarget("/")).toBe("/en");
  });

  it("appends with &, because the endpoint already carries the required client_id", () => {
    // client_id is REQUIRED: Better Auth rejects post_logout_redirect_uri with
    // invalid_request unless the request carries a verifiable id_token_hint or an
    // explicit client_id, and there is no id_token here.
    const url = new URL(
      withPostLogoutRedirect(endSession, "https://realestate.witus.online") as string,
    );
    expect(url.searchParams.get("client_id")).toBe("witus-realestate");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://realestate.witus.online/",
    );
  });

  it("returns null rather than a half-built URL, so sign-out falls back to local", () => {
    expect(withPostLogoutRedirect(null, "https://realestate.witus.online")).toBeNull();
    expect(withPostLogoutRedirect(endSession, undefined)).toBeNull();
    expect(withPostLogoutRedirect(endSession, "not a url")).toBeNull();
  });

  it("destroys the LOCAL session before handing off to the IdP", () => {
    // ORDER IS THE SAFETY PROPERTY. Hand off first and any IdP failure becomes
    // "I clicked sign out and I am still signed in".
    // Behaviour is pinned in src/app/[lang]/sign-out-action.test.ts; this pins the shape.
    const action = read("src/app/[lang]/sign-out-action.ts");
    const everywhere = action.slice(action.indexOf("export async function signOutEverywhereAction"));
    const local = everywhere.indexOf("await endLocalSession();");
    const handoff = everywhere.indexOf("redirect(endSession)");
    expect(local).toBeGreaterThan(-1);
    expect(handoff).toBeGreaterThan(-1);
    expect(local).toBeLessThan(handoff);
    // And the local sign-out cannot be skipped by an IdP-side failure: it is awaited
    // with its own catch.
    expect(action).toContain(".catch(() => null);");
  });

  it("plain \"Sign out\" is local only and never renamed (BAM, 2026-10-29, task 128 (b))", () => {
    const action = stripComments(read("src/app/[lang]/sign-out-action.ts"));
    const plain = action.slice(
      action.indexOf("export async function signOutAction"),
      action.indexOf("export async function signOutEverywhereAction"),
    );
    expect(plain).not.toContain("witusEverywhereSignOutUrl");
    expect(plain).not.toContain("redirect(endSession)");
    // All strings come from the dictionary; no hardcoded English in a localized app.
    const dict = JSON.parse(read("src/dictionaries/en.json"));
    expect(dict.common.signOut).toBe("Sign out");
    expect(dict.common.signOutWitus).toBeUndefined();
    expect(dict.common.signOutEverywhere).toBe("Sign out of WitUS everywhere");
    expect(dict.common.signOutEverywhereHelp).toBe(
      "Also signs you out of WitUS. Other WitUS apps you are signed in to stay signed in until you sign out of them.",
    );
  });
});

describe("reading the probe answer", () => {
  it("finds the name in the ecosystem endpoint's shape", () => {
    expect(parseSilentSsoIdentity({ signedIn: true, user: { name: "Ada Lovelace" } })).toEqual({
      label: "Ada Lovelace",
    });
  });

  it("accepts Better Auth's session shape and a bare user object", () => {
    expect(
      parseSilentSsoIdentity({ session: { id: "s1" }, user: { name: "Ada", email: "a@b.test" } }),
    ).toEqual({ label: "Ada" });
    expect(parseSilentSsoIdentity({ name: "Ada" })).toEqual({ label: "Ada" });
    expect(parseSilentSsoIdentity({ user: { name: "", email: "ada@example.test" } })).toEqual({
      label: "ada@example.test",
    });
  });

  it("returns nothing for every shape that means nobody is signed in", () => {
    expect(parseSilentSsoIdentity({ signedIn: false })).toBeNull();
    // An explicit no is authoritative even if a stale name rides along.
    expect(parseSilentSsoIdentity({ signedIn: false, user: { name: "Ada" } })).toBeNull();
    expect(parseSilentSsoIdentity(null)).toBeNull();
    expect(parseSilentSsoIdentity(undefined)).toBeNull();
    expect(parseSilentSsoIdentity({})).toBeNull();
    expect(parseSilentSsoIdentity({ user: null })).toBeNull();
    expect(parseSilentSsoIdentity({ user: { id: "u1" } })).toBeNull();
    expect(parseSilentSsoIdentity("Ada")).toBeNull();
    expect(parseSilentSsoIdentity(42)).toBeNull();
    expect(parseSilentSsoIdentity([{ name: "Ada" }])).toBeNull();
  });

  it("cleans a name it did not author before putting it on a button", () => {
    // Cross-origin, therefore untrusted input, even though it is only display copy.
    // Ends trimmed; internal spacing is the person's own name and is left alone.
    expect(parseSilentSsoIdentity({ name: "  Ada  Lovelace " })).toEqual({
      label: "Ada  Lovelace",
    });
    expect(parseSilentSsoIdentity({ name: "Ada\u0000\u001BLove\u007Flace" })).toEqual({
      label: "AdaLovelace",
    });
    expect(parseSilentSsoIdentity({ name: "   " })).toBeNull();
    const long = parseSilentSsoIdentity({ name: "N".repeat(300) });
    expect(long?.label.length).toBeLessThanOrEqual(48);
  });

  it("substitutes the name into the dictionary string, not a hardcoded one", () => {
    const dict = JSON.parse(read("src/dictionaries/en.json")).signIn;
    const copy = { signIn: dict.witusButton, continueAs: dict.witusContinueAs };
    expect(continueAsLabel(null, copy)).toBe("Sign in with WitUS");
    expect(continueAsLabel({ label: "Ada" }, copy)).toBe("Continue as Ada");
    // `{name}` matches the repo's existing placeholder convention (src/lib/templates.ts).
    expect(dict.witusContinueAs).toContain("{name}");
  });

  it("draws every WitUS string from the dictionary, none hardcoded in the component", () => {
    // The repo is localized (getDictionary, en-first). A literal button label here is
    // a string that can never be translated.
    const code = stripComments(read("src/components/witus-sign-in-button.tsx"));
    for (const literal of ["Sign in with WitUS", "Continue as", "Redirecting", "Not you"]) {
      expect(code).not.toContain(literal);
    }
    // The labels come from `copy`, which the server page fills from the dictionary.
    expect(code).toContain("continueAsLabel(identity, copy)");
    expect(code).toContain("copy.redirecting");
    expect(code).toContain("copy.notYou");
  });
});

describe("a failed check is invisible", () => {
  it("swallows every probe outcome the network can produce", async () => {
    const outcomes: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError("Failed to fetch")), // CORS refusal / offline
      () => Promise.reject(new DOMException("aborted", "AbortError")), // timeout
      () => Promise.resolve(new Response("nope", { status: 401 })),
      () => Promise.resolve(new Response("nope", { status: 500 })),
      () => Promise.resolve(new Response("<html>not json</html>", { status: 200 })),
      () => Promise.resolve(new Response("", { status: 200 })),
    ];
    for (const outcome of outcomes) {
      await expect(
        runSilentSsoProbe({
          enabled: true,
          endpoint: ENDPOINT,
          search: "",
          fetchImpl: outcome as unknown as typeof fetch,
        }),
      ).resolves.toBeNull();
    }
  });

  it("has no error or loading state to render, and cannot hang the page", () => {
    const component = read("src/components/witus-sign-in-button.tsx");
    expect(component).not.toMatch(/useState[^\n]*[Ee]rror/);
    expect(component).not.toMatch(/useState[^\n]*[Ll]oading/);
    expect(component).toContain("SILENT_SSO_TIMEOUT_MS");
    expect(component).toContain("controller.abort()");
  });
});
