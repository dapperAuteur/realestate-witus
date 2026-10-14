// Ported from wanderlearn-app src/lib/http-url.ts @ c7f5616, 2026-10-14 (plans/08).
// The zod schema became parseHttpUrl: this repo validates by hand.

/**
 * Links an agent types (hotspot links, tour links) must be http: or https:.
 * "Does new URL() parse it" is not enough: `javascript:` and `data:` URLs parse,
 * and a hotspot opens its link with `window.open`, which React's href guard
 * never sees.
 */
export const HTTP_URL_MAX = 500;

/** Client-side check, for the moment a stored link is opened. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Server-side check for a typed link: the trimmed URL, or null when it is not a usable http(s) link. */
export function parseHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > HTTP_URL_MAX) return null;
  return isHttpUrl(trimmed) ? trimmed : null;
}
