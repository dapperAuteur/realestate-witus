// Ecosystem SSO, the two halves that need pure logic: the silent
// "Continue as <name>" check on the sign-in page, and the RP-initiated
// "Sign out of WitUS everywhere". See src/lib/witus-sso.ts for the GATE that decides whether either
// one runs at all — this file only implements what happens once it says yes.
//
// WHY THIS FILE IS PURE. It has no "server-only", no next/headers, no window
// access at module scope, and no import from @/lib/env. That is deliberate
// three ways: the sign-in button is a client component and cannot import a
// module that touches next/headers; the tests import these functions directly
// (no test in this repo uses vi.mock, and a leak-prevention path is the last
// place to start); and keeping the IdP URL derivation next to the parsing keeps
// both testable against the same discovery URL.
//
// WHAT THE PROBE BUYS AND WHAT IT DOES NOT. runSilentSsoProbe sends the IdP's
// cookie as a THIRD-PARTY cookie, so it answers on Chrome/Edge and returns
// nothing under Safari ITP or Firefox Total Cookie Protection. That is the
// design, not a bug: a probe that answers nothing renders nothing, and the
// visitor keeps the exact sign-in page they already had.
//
// THE NAME THIS RETURNS IS DISPLAY COPY, NEVER A CREDENTIAL. It arrives from a
// cross-origin response, so it is client-supplied by definition. It must never
// gate access, populate a session, or be sent anywhere. Clicking the button runs
// the real OIDC code flow (signInWithWitus, which re-checks the host gate),
// which is the only thing that establishes identity here.

/** Query param marking "this browser already tried the ecosystem flow". */
export const SSO_ATTEMPT_PARAM = "sso";
export const SSO_ATTEMPT_VALUE = "tried";

/**
 * sessionStorage key for the same marker. Written IMMEDIATELY BEFORE the browser
 * is sent to the IdP, never after it comes back: a marker written on return is a
 * marker that never exists when the return is the thing that failed.
 */
export const SSO_ATTEMPT_STORAGE_KEY = "witus.sso.attempted";

/** How long to wait for the probe. A silent check that hangs is a broken page. */
export const SILENT_SSO_TIMEOUT_MS = 4000;

/** Longest display name rendered. Caps an absurd or hostile value. */
const MAX_LABEL_LENGTH = 48;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * OIDC authorization-error codes meaning "the IdP will not finish this without a
 * human". `access_denied` is the one that fires in practice: the visitor clicked
 * "Continue as ...", the IdP asked them to confirm, and they cancelled.
 *
 * All of them share one correct response — put the visitor back on the sign-in
 * form with no error and with the one-shot marker set.
 */
export const SILENT_AUTH_FAILURES = [
  "login_required",
  "interaction_required",
  "consent_required",
  "account_selection_required",
  "access_denied",
] as const;

export function isSilentAuthFailure(error: string | null | undefined): boolean {
  return typeof error === "string" && (SILENT_AUTH_FAILURES as readonly string[]).includes(error);
}

/** Identity shown on the button. Display only, never a credential. */
export interface SsoIdentity {
  /** Already trimmed, de-controlled, and length-capped. */
  label: string;
}

export type SilentSsoSkip =
  | "host-not-eligible"
  | "not-configured"
  | "already-attempted"
  | "already-signed-in";

export type SilentSsoDecision = { attempt: true } | { attempt: false; skip: SilentSsoSkip };

export interface SilentSsoInput {
  /**
   * The SERVER-RESOLVED host gate (showWitusSignIn, src/lib/witus-sso.ts), handed
   * down from the sign-in page. Checked FIRST and it is the one that matters: a
   * single request to accounts.witus.online from an agency's own domain would both
   * reveal that the ecosystem exists AND tell it someone visited that agency.
   * Never re-derive this here, and never accept a host from the client.
   */
  enabled: boolean;
  endpoint: string | null | undefined;
  search?: string | null;
  attempted?: boolean;
  signedIn?: boolean;
}

/**
 * Should this browser ask the IdP who it is?
 *
 * Fails closed in the same order the risks rank: host gate, then configuration,
 * then "there is nothing to ask on behalf of", then the loop guard.
 */
export function silentSsoDecision(input: SilentSsoInput): SilentSsoDecision {
  if (!input.enabled) return { attempt: false, skip: "host-not-eligible" };
  if (!input.endpoint) return { attempt: false, skip: "not-configured" };
  if (input.signedIn) return { attempt: false, skip: "already-signed-in" };
  if (input.attempted || hasAttemptMarker(input.search)) {
    return { attempt: false, skip: "already-attempted" };
  }
  return { attempt: true };
}

/** Does this query string carry the one-shot marker? Accepts "?a=b" or "a=b". */
export function hasAttemptMarker(search: string | null | undefined): boolean {
  if (typeof search !== "string" || search === "") return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(SSO_ATTEMPT_PARAM) === SSO_ATTEMPT_VALUE;
}

/** Add the one-shot marker to a same-origin path, preserving any query it has. */
export function withAttemptMarker(path: string): string {
  const [beforeHash, ...hashRest] = path.split("#");
  const hash = hashRest.length > 0 ? `#${hashRest.join("#")}` : "";
  const [pathname, ...queryRest] = beforeHash.split("?");
  const params = new URLSearchParams(queryRest.join("?"));
  params.set(SSO_ATTEMPT_PARAM, SSO_ATTEMPT_VALUE);
  return `${pathname}?${params.toString()}${hash}`;
}

/**
 * Split a discovery URL into the IdP's origin and its Better Auth basePath.
 *
 *   https://accounts.witus.online/api/idp/.well-known/openid-configuration
 *     → { origin: "https://accounts.witus.online", basePath: "/api/idp" }
 *
 * Everything below derives from this rather than naming accounts.witus.online a
 * second time, so the only external value this app asserts stays the discovery
 * URL it is already configured with (authoritative-values rule).
 */
function splitDiscoveryUrl(
  discoveryUrl: string | null | undefined,
): { origin: string; basePath: string } | null {
  if (!discoveryUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(discoveryUrl);
  } catch {
    return null;
  }
  const cut = parsed.pathname.indexOf("/.well-known/");
  if (cut < 0) return null;
  return { origin: parsed.origin, basePath: parsed.pathname.slice(0, cut) };
}

/**
 * The ecosystem session probe: `<idp-origin>/api/ecosystem/session`.
 *
 * NOT Better Auth's `<basePath>/get-session`. That route returns `{ session, user }`
 * and `session` carries the SESSION TOKEN, so a credentialed cross-origin probe
 * against it would let any ecosystem origin — or an XSS on one — lift a live IdP
 * session. `/api/ecosystem/session` is the purpose-built replacement in
 * gemini/witus: same cookie, but it answers with a display label and nothing else,
 * and its allow-origin list comes from the IdP's own client registry.
 *
 * Fixed path on the IdP's ORIGIN, not under its basePath, so an IdP mounted at the
 * root derives the same route.
 */
export function silentSsoEndpointFromDiscovery(
  discoveryUrl: string | null | undefined,
): string | null {
  const parts = splitDiscoveryUrl(discoveryUrl);
  if (!parts) return null;
  return `${parts.origin}/api/ecosystem/session`;
}

/**
 * The IdP's RP-initiated logout endpoint, `<basePath>/oauth2/endsession` — the
 * `end_session_endpoint` the discovery document advertises. Unlike the probe this
 * one DOES live under the Better Auth basePath.
 *
 * Used ONLY by "Sign out of WitUS everywhere". The plain "Sign out" ends this
 * app's session alone and never navigates here (BAM, 2026-10-29, witus task 128
 * option (b)); this endpoint ends the shared WitUS session, after which the next
 * "Sign in with WitUS" shows the WitUS login page again.
 */
export function endSessionEndpointFromDiscovery(
  discoveryUrl: string | null | undefined,
): string | null {
  const parts = splitDiscoveryUrl(discoveryUrl);
  if (!parts) return null;
  return `${parts.origin}${parts.basePath}/oauth2/endsession`;
}

/**
 * Finish the endsession URL by appending where the IdP should send the visitor back.
 *
 * THE TRAILING SLASH IS REQUIRED. Better Auth exact-matches `post_logout_redirect_uri`
 * against the client's registered redirectUrls, and the IdP registry
 * (gemini/witus lib/identity/clients.ts) registers `origin + "/"` — for slug
 * `realestate` that is exactly `https://realestate.witus.online/`. Drop the slash and
 * the IdP answers 400.
 *
 * The registry deliberately registers the bare "/" even though this app is localized
 * and "/" 307s to "/en": the redirect belongs to the app, not to the registry, so no
 * locale is baked into an external system's config. Sending "/en" here would be an
 * unregistered URI and a 400.
 *
 * `&`, not `?`: the endpoint handed in already carries `client_id` (src/lib/env.ts).
 * Returns null for a missing endpoint or an unparseable origin so callers fall back
 * to a purely local sign-out rather than navigating somewhere invented.
 */
export function withPostLogoutRedirect(
  endSessionUrl: string | null | undefined,
  appOrigin: string | null | undefined,
): string | null {
  if (!endSessionUrl || !appOrigin) return null;
  let origin: string;
  try {
    origin = new URL(appOrigin).origin;
  } catch {
    return null;
  }
  const back = `${origin}/`;
  return `${endSessionUrl}&post_logout_redirect_uri=${encodeURIComponent(back)}`;
}

/**
 * Read a display name out of the probe response.
 *
 * Handles `{ signedIn, user: { name } }`, Better Auth's `{ session, user }`, and a
 * bare user object. Everything else — including the signed-out answer, which is a
 * 200 with a null-ish body — yields null, which renders nothing.
 */
export function parseSilentSsoIdentity(payload: unknown): SsoIdentity | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  // An explicit `signedIn: false` is authoritative even if a stale name rides along.
  if (root.signedIn === false) return null;
  const candidate =
    root.user && typeof root.user === "object" ? (root.user as Record<string, unknown>) : root;
  const label = cleanLabel(candidate.name) ?? cleanLabel(candidate.email);
  return label ? { label } : null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARS, "").trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_LABEL_LENGTH
    ? `${cleaned.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

/**
 * Button copy. Takes the strings rather than owning them: every visitor-facing
 * string in this app comes from a dictionary (src/dictionaries/en.json is the source
 * of truth), and `{name}` substitution matches the repo's existing placeholder
 * convention in src/lib/templates.ts.
 */
export function continueAsLabel(
  identity: SsoIdentity | null,
  copy: { signIn: string; continueAs: string },
): string {
  return identity ? copy.continueAs.replace("{name}", identity.label) : copy.signIn;
}

/**
 * The whole probe, decision included, with `fetch` injected.
 *
 * THIS IS THE ISOLATION BOUNDARY, and injecting fetch is what makes it provable
 * rather than asserted: silent-sso.test.ts hands in a counting stub and pins that an
 * agency tenant host (`enabled: false`) produces ZERO calls, under every combination
 * of the other inputs. A source-grep can only show the code looks right; this shows
 * it behaves right.
 *
 * NEVER THROWS AND NEVER REPORTS. Network error, CORS refusal, abort, timeout,
 * non-JSON body, 4xx, 5xx — all resolve to null, because a failed silent check must
 * be completely invisible: no error, no spinner, no layout shift.
 */
export async function runSilentSsoProbe(
  input: SilentSsoInput & { fetchImpl: typeof fetch; signal?: AbortSignal },
): Promise<SsoIdentity | null> {
  const decision = silentSsoDecision(input);
  // `!input.endpoint` is implied by decision.attempt; repeating it makes the
  // narrowing the compiler's rather than a cast that could outlive the invariant.
  if (!decision.attempt || !input.endpoint) return null;
  try {
    // `credentials: "include"` is the entire mechanism: the answer depends on the
    // IdP's OWN cookie, which is third-party from here.
    const res = await input.fetchImpl(input.endpoint, {
      credentials: "include",
      mode: "cors",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: input.signal,
    });
    if (!res.ok) return null;
    return parseSilentSsoIdentity(await res.json());
  } catch {
    return null;
  }
}

/**
 * Turn a failed ecosystem callback into a quiet return to the sign-in form.
 *
 * Needed because Better Auth's generic-oauth callback redirects on `ctx.query.error`
 * BEFORE it parses the state that carries our `errorCallbackURL` (verified in
 * node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs: the `ctx.query.error`
 * branch sits above `parseState`). Without this, an IdP decline lands on Better Auth's
 * raw /api/auth/error page.
 *
 * Deliberately NARROW: only this app's own witus callback path, only the codes in
 * SILENT_AUTH_FAILURES. A real fault (token-exchange failure, issuer mismatch) still
 * surfaces the way it does today instead of being swallowed into a blank form.
 *
 * The returned path is locale-less on purpose. src/middleware.ts 307s "/sign-in" to
 * "/en/sign-in" and preserves the query, so the marker survives without this route
 * having to guess a language the callback never carried.
 */
export function silentSsoRecoveryPath(url: URL, signInPath = "/sign-in"): string | null {
  if (!/\/oauth2\/callback\/witus\/?$/.test(url.pathname)) return null;
  if (!isSilentAuthFailure(url.searchParams.get("error"))) return null;
  return withAttemptMarker(signInPath);
}
