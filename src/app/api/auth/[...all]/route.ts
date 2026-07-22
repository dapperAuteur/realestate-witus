import { NextResponse } from "next/server";
import { auth, hasAuth } from "@/lib/auth";
import { err } from "@/lib/result";

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
  return auth().handler(request);
}

export async function POST(request: Request) {
  if (!hasAuth()) return unavailable();
  return auth().handler(request);
}
