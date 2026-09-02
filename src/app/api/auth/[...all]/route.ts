import { NextResponse } from "next/server";
import { auth, hasAuth } from "@/lib/auth";
import { err } from "@/lib/result";
import { silentSsoRecoveryPath } from "@/lib/silent-sso";

// All Better Auth endpoints (magic link request/verify, session, sign-out).
// 503 instead of a crash while BETTER_AUTH_SECRET is unset (user-task 09).

function unavailable() {
  return NextResponse.json(
    err("AUTH_UNAVAILABLE", "Authentication is not configured."),
    { status: 503 },
  );
}

export async function GET(request: Request) {
  if (!hasAuth()) return unavailable();

  // Ahead of Better Auth, and only for the narrow case it cannot handle itself: the
  // WitUS IdP declining to complete the flow (see silentSsoRecoveryPath). Better Auth's
  // generic-oauth callback redirects on `ctx.query.error` BEFORE it parses the state
  // carrying our errorCallbackURL, so without this the visitor lands on its raw
  // /api/auth/error page instead of quietly back on the sign-in form.
  //
  // The recovery path is locale-less; src/middleware.ts 307s /sign-in to /en/sign-in and
  // keeps the query, so the `?sso=tried` marker survives without this route guessing a
  // language the callback never carried. A relative Location is required, not optional:
  // every agency tenant is on its own domain, so the browser has to resolve it.
  const recovery = silentSsoRecoveryPath(new URL(request.url));
  if (recovery) {
    return new NextResponse(null, { status: 302, headers: { location: recovery } });
  }

  return auth().handler(request);
}

export async function POST(request: Request) {
  if (!hasAuth()) return unavailable();
  return auth().handler(request);
}
