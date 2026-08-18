import { NextResponse, type NextRequest } from "next/server";
import { localeRedirectTarget } from "@/lib/locales";

// Every page lives under /[lang]; without this, the bare domain 404s.
// 307 (not 308): once es ships, "/" will negotiate per Accept-Language and
// a cached permanent redirect would pin early visitors to /en forever.

export function middleware(request: NextRequest) {
  const target = localeRedirectTarget(request.nextUrl.pathname);
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Skip api, Next internals, the PostHog ingest proxy, and anything with a file
  // extension.
  //
  // `ingest` is load-bearing, not a micro-optimization. next.config.ts rewrites
  // /ingest/:path* to PostHog, but middleware runs BEFORE rewrites — so without this
  // exclusion the matcher catches "/ingest/e/" (no locale prefix, no file extension,
  // not under /api) and localeRedirectTarget 307s it to "/en/ingest/e/", which matches
  // no rewrite and 404s inside [lang]. Every analytics event would be silently lost.
  // /ingest/static/array.js escapes via the file-extension rule, so the failure would
  // be the confusing kind: the PostHog snippet loads and then nothing is ever recorded.
  matcher: ["/((?!api|_next|ingest|og$|.*\\..*).*)"],
};
