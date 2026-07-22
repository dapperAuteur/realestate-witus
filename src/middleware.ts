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
  // Skip api, Next internals, and anything with a file extension.
  matcher: ["/((?!api|_next|og$|.*\\..*).*)"],
};
