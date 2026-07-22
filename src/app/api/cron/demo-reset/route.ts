import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/demo/accounts";
import { env, hasDatabase } from "@/lib/env";
import { err, ok } from "@/lib/result";

// Nightly demo wipe + reseed (vercel.json, 0 0 * * * = midnight UTC —
// Accra is UTC year-round, so midnight local too). Same CRON_SECRET guard
// as sweep-holds; GET for Vercel Cron, POST for a manual trigger.

function authorized(request: Request): boolean {
  return Boolean(
    env.CRON_SECRET &&
      request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`,
  );
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(err("UNAUTHORIZED", "Invalid cron secret."), {
      status: 401,
    });
  }
  if (!hasDatabase) {
    return NextResponse.json(err("NO_DATABASE", "DATABASE_URL is not set."), {
      status: 503,
    });
  }
  const result = await resetDemoData();
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(ok({ resetAt: new Date().toISOString() }));
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
