// Locale registry shared by middleware and server code. Kept free of
// "server-only" so src/middleware.ts can import it; the dictionary loaders
// (server-only) live in dictionaries.ts.

export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Where middleware should send a locale-less path, or null to pass through.
 * "/" → "/en", "/listings" → "/en/listings"; api/_next/static files untouched.
 * When es lands, this is where Accept-Language negotiation slots in.
 */
export function localeRedirectTarget(pathname: string): string | null {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    // Reverse-proxied to PostHog by next.config.ts. The middleware matcher already
    // excludes it; this is the second line of defence, and the testable one — a locale
    // redirect here would send ingest to /en/ingest/e/ and drop every analytics event.
    pathname.startsWith("/ingest/") ||
    pathname === "/og" // generated OG card, not a page
  ) {
    return null;
  }
  if (/\.[^/]+$/.test(pathname)) return null;
  const first = pathname.split("/")[1] ?? "";
  if (hasLocale(first)) return null;
  return pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
}
