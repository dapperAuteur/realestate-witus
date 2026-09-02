import { headers } from "next/headers";
import { cache } from "react";
import { env, hasWitusSso } from "@/lib/env";
import { normalizeHost, resolveTenant } from "@/lib/tenant";

// "Sign in with WitUS" is scoped to the WitUS-BRANDED platform host only.
//
// This is the white-label invariant in CLAUDE.md, which reads "Auth is product-local
// Better Auth (magic link; staff invites; no shared WitUS OIDC for CUSTOMER TENANTS)"
// — scoped to tenants, so the platform surface is in bounds. The reason is concrete:
// an agency's mail sends from the agency's own domain under the agency's brand and
// never says RealEstate.WitUS (src/lib/auth.ts, src/lib/mailer.ts). Offering "Sign in
// with WitUS" on an agency's own site would redirect that agency's buyers to
// accounts.witus.online and reveal the shared backend, which is exactly what the rule
// exists to prevent.
//
// Defence in depth, three independent layers — any one alone is sufficient:
//
//   1. This gate. The button does not render off the branded host, and the server
//      action re-checks it (a server action is a public POST endpoint, so rendering
//      logic alone would not be a control).
//   2. The IdP registry. Slug `realestate` registers ONE redirect URI, the branded
//      host's. An agency domain attempting the flow sends an unregistered
//      redirect_uri and the IdP returns 400. Even a bug here fails closed rather
//      than leaking.
//   3. hasWitusSso. No client credentials, no provider and no button.
//
// Layer 2 is why agency hosts must never be added to that entry's extraRedirectUris.
//
// The decision itself is split into a pure function so it is unit-testable without
// mocking next/headers or the database (see witus-sso.test.ts) — no test in this repo
// uses vi.mock, and a security gate is the last place to start.

/**
 * What the tenant lookup told us.
 *
 * `platform` is the case that separates this repo from its stay-witus sibling and it
 * is NOT cosmetic: scripts/seed-tenants.ts registers `realestate.witus.online` itself
 * as a tenant domain, owned by the seeded platform tenant (`flags.platform: true`).
 * Stay.WitUS seeds no such row, so its gate can require "no tenant at all"; requiring
 * that here would hide the button on the one host it is meant to appear on, the
 * moment the platform tenant is seeded. `platform` is a WitUS-branded surface, not a
 * customer's, so it passes; `tenant` is an agency and never does.
 *
 * `unknown` means the lookup threw, e.g. database down.
 */
export type TenantOutcome = "none" | "platform" | "tenant" | "unknown";

/**
 * The host this deployment treats as its WitUS-branded origin, derived from
 * BETTER_AUTH_URL rather than a hardcoded "realestate.witus.online".
 *
 * BETTER_AUTH_URL is already the authoritative origin for the deployment — Better Auth
 * builds its callback URLs from it, so it is by definition the host whose redirect URI
 * is registered with the IdP. Hardcoding the production hostname would break local dev
 * and previews, and would restate a value another system owns (authoritative-values
 * rule).
 *
 * Deliberately NOT isPlatformHost() (src/lib/platform-host.ts). That helper answers a
 * different question — "does this host render the product's own landing page?" — and
 * answers it generously, matching every *.vercel.app preview. Generous is right for a
 * landing page and wrong for this: the IdP exact-matches redirect URIs, so a preview
 * host would show a button that can only 400, and every extra host in the set is one
 * more chance for an agency domain to slip in.
 *
 * Returns null on a missing or malformed URL, which makes the caller fail closed.
 */
export function brandedHostFrom(betterAuthUrl: string | undefined): string | null {
  if (!betterAuthUrl) return null;
  try {
    return normalizeHost(new URL(betterAuthUrl).host);
  } catch {
    return null;
  }
}

/**
 * The whole decision, as a pure function.
 *
 * Requires ALL of: credentials configured, a known branded host, the request arriving
 * on that host, and a tenant outcome that is not a customer agency.
 *
 * Fails CLOSED on every uncertainty, including `unknown`. The asymmetry is the point:
 * a false negative costs BAM a magic link, a false positive leaks the shared backend
 * to an agency's buyers.
 */
export function shouldShowWitusSignIn(input: {
  hasCredentials: boolean;
  brandedHost: string | null;
  requestHost: string | null;
  tenantOutcome: TenantOutcome;
}): boolean {
  const { hasCredentials, brandedHost, requestHost, tenantOutcome } = input;
  if (!hasCredentials) return false;
  if (!brandedHost || !requestHost) return false;
  if (normalizeHost(requestHost) !== brandedHost) return false;
  // An allow-list, not a deny-list: a future outcome value that nobody thought about
  // here is refused rather than admitted.
  return tenantOutcome === "none" || tenantOutcome === "platform";
}

/** Resolves the tenant, mapping a thrown lookup to `unknown` rather than to "no tenant". */
async function tenantOutcome(): Promise<TenantOutcome> {
  try {
    const tenant = await resolveTenant();
    if (!tenant) return "none";
    return tenant.flags.platform ? "platform" : "tenant";
  } catch {
    return "unknown";
  }
}

/**
 * Show the WitUS sign-in option for this request?
 *
 * Memoized per request: the sign-in page and the server action both call it, and there
 * is no reason to resolve the tenant twice.
 */
export const showWitusSignIn = cache(async (): Promise<boolean> => {
  const h = await headers();
  return shouldShowWitusSignIn({
    hasCredentials: hasWitusSso,
    brandedHost: brandedHostFrom(env.BETTER_AUTH_URL),
    requestHost: h.get("host"),
    tenantOutcome: await tenantOutcome(),
  });
});

/**
 * THE SAME GATE, under the name the rest of the ecosystem wiring reads by.
 *
 * "Sign in with WitUS" was the first thing this gate protected, but it is not the
 * only one. Two more surfaces cross to accounts.witus.online and must be dark on an
 * agency tenant domain for exactly the same reason:
 *
 *   - the silent "Continue as <name>" probe on the sign-in page, and
 *   - global sign-out, which redirects to the IdP's endsession endpoint.
 *
 * A single request from an agency's own domain both reveals that the ecosystem exists
 * AND tells it that someone visited that agency — so this is not merely "don't show a
 * button", it is "don't touch that origin at all".
 *
 * Deliberately an ALIAS — the same binding, not a second implementation. A parallel
 * `showEcosystemSso()` with its own copy of the host comparison is exactly how one
 * of these three surfaces ends up gated differently from the others after someone
 * edits one and not the other. witus-sso.test.ts pins the identity so it stays one.
 */
export const witusEcosystemEnabled = showWitusSignIn;
