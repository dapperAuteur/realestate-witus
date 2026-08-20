/**
 * Event taxonomy for RealEstate.WitUS.
 *
 * The ecosystem shares ONE PostHog project, separated by the `app` property that
 * posthog-provider registers on load. Two rules keep that project readable, and both
 * are cheap now and expensive to retrofit once data has landed:
 *
 *   1. `snake_case`, object first, verb in past tense — `route_viewed`.
 *   2. NEVER put the app name in the event name. `realestate_signin_started` is wrong:
 *      it makes the same action from two apps look like two events and kills the
 *      cross-app comparison that sharing a project exists to enable. The `app`
 *      property already carries that.
 *
 * Shared lifecycle events (the SHARED_EVENTS block) use identical names in every
 * ecosystem app, so "where do people fall out of sign-in" is answerable across all of
 * them at once. Do not rename these here without renaming them everywhere.
 *
 * See gemini/witus/plans/26-posthog-ecosystem-rollout.md for the full contract and
 * gemini/witus/lib/analytics/INTEGRATE.md for the integration playbook.
 */

/**
 * Slug carried on every event so this app's data stays separable in the shared project.
 *
 * `realestate`, not the repo name. Elsewhere in the ecosystem this is the app's identity
 * slug from gemini/witus/lib/identity/clients.ts, so a funnel can join PostHog events to
 * the app that authenticated the user without a translation table (INTEGRATE.md step 4).
 * This app has no OIDC client — customer tenants use product-local Better Auth — so it
 * has no identity slug, and the authoritative value is the one fixed in
 * gemini/witus/scripts/check-posthog-conformance.mjs, which enforces it. Using
 * "realestate-witus" here would fragment one app into two series in the shared project,
 * and no back-fill merges them cleanly.
 */
export const ANALYTICS_APP = "realestate";

/**
 * Events with identical names across every ecosystem app. Names are contractual.
 *
 * Declared here so the contract is visible and a future sign-in instrumentation uses
 * the ecosystem names rather than inventing new ones. Nothing emits them yet: sign-in
 * is magic-link only and the page is a plain form driven by a server action, so it
 * works without client JS. Firing these would mean converting it to a client
 * component — a real cost for an analytics nicety. Wire them if and when that page
 * gains client JS for its own reasons.
 */
export const SHARED_EVENTS = {
  signinStarted: "signin_started",
  signinSucceeded: "signin_succeeded",
  signinFailed: "signin_failed",
} as const;

/**
 * Events specific to RealEstate.WitUS.
 *
 * DELIBERATELY MINIMAL. The listings and tour workstreams have not landed (HANDOFF.md,
 * post-strip state), so the events that will eventually matter here — a listing viewed,
 * a tour opened, an embed loaded on an agent's own site — have no routes to fire from
 * yet. Inventing their names now would guess at properties nobody can check, and an
 * event name is permanent in the shared project once data lands under it. Route views
 * answer the questions this app can currently ask.
 *
 * When listings arrive, identify a listing by SLUG or id, never by address or display
 * name: an address is both a display name that gets reworded and, on a residential
 * listing, a real-world location tied to a named seller.
 */
export const EVENTS = {
  /** An explicit route view. capture_pageview is off — Next's client router would
   *  fire it once and then lie — so route changes are reported deliberately.
   *  The pathname is passed through safePathname() first (see ./pathname). */
  routeViewed: "route_viewed",
  ...SHARED_EVENTS,
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
