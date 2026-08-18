/**
 * Make a pathname safe to send to a third-party analytics vendor.
 *
 * WHY THIS EXISTS. The ecosystem standard captures `route_viewed` with the raw
 * `usePathname()` value. In most apps that is harmless. In this one it is not: a staff
 * invite is a BEARER CREDENTIAL carried in the path (`/en/invite/<token>`,
 * `randomBytes(24).toString("base64url")` — src/lib/admin/invites.ts). Sending that
 * pathname verbatim would hand a live, unexpired credential to PostHog: a copy of the
 * exact secret the recipient's email was supposed to be the only carrier of.
 *
 * src/lib/sentry-scrub.ts already refuses to let those URLs reach the error sink for
 * the same reason. This is the analytics half of that rule; it is a separate, smaller
 * copy on purpose, because sentry-scrub is server-side and pulling it into the browser
 * bundle to reuse one regex would be the worse trade. If the token FORMAT ever changes,
 * change it in both places.
 *
 * The route SHAPE survives — `/en/invite/<token>` is still attributable to the invite
 * flow — which is the half worth keeping. Only credential-shaped segments are
 * collapsed; opaque record ids (a support ticket, and the listing slugs arriving with
 * the listings workstream) are left alone, because they are not secrets and the listing
 * slug in particular is a signal worth having.
 */

/** The placeholder a redacted segment becomes. Matches sentry-scrub.ts's `describe()`. */
export const REDACTED_SEGMENT = "<token>";

/**
 * Path segments whose NEXT segment is a credential by construction in this app.
 * Positional, so it holds whatever the token looks like — this is the guarantee, and
 * the shape heuristic below is only the backstop. Fail closed: listing a route that
 * turns out not to carry a secret costs one collapsed analytics value; omitting one
 * that does costs a leaked credential. `partner` and `unsubscribe` are carried over
 * from the stay-witus spine this repo was seeded from — they have no routes here yet,
 * and listing them ahead of time costs nothing.
 */
const CREDENTIAL_PARENTS = new Set([
  "invite",
  "partner",
  "accept",
  "activate",
  "confirm",
  "reset",
  "reset-password",
  "set-password",
  "magic-link",
  "unsubscribe",
]);

/**
 * Does this segment LOOK generated rather than authored? Catches a future
 * /whatever/<token> route nobody remembered to add above.
 *
 * Length alone is not enough: `riverside-commercial-lot-b` is 26 characters and is the
 * kind of listing slug we want to keep. Generated tokens here are base64url, so they
 * carry mixed case in practice (a 32-char base64url string with no uppercase is a
 * ~1-in-10-million event); an authored slug is lowercase kebab-case. So: long AND (has
 * uppercase OR has no hyphen). A long unhyphenated lowercase slug trips this and gets
 * collapsed — a false positive we accept, because the failure direction is losing one
 * analytics value rather than leaking one secret.
 */
function looksGenerated(segment: string): boolean {
  if (segment.length < 20) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return false;
  return /[A-Z]/.test(segment) || !segment.includes("-");
}

/**
 * Redact credential-bearing segments out of a pathname, preserving the route shape.
 *
 * Takes the pathname only — never a full URL and never a query string. `usePathname()`
 * excludes the query, and the provider deliberately does not read `useSearchParams()`,
 * so query secrets (`?token=`) never reach this function or PostHog.
 */
export function safePathname(pathname: string): string {
  if (!pathname) return pathname;

  const segments = pathname.split("/");
  return segments
    .map((segment, i) => {
      if (!segment) return segment;
      const parent = segments[i - 1]?.toLowerCase();
      if (parent && CREDENTIAL_PARENTS.has(parent)) return REDACTED_SEGMENT;
      if (looksGenerated(segment)) return REDACTED_SEGMENT;
      return segment;
    })
    .join("/");
}
