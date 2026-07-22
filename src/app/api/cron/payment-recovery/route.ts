import { NextResponse } from "next/server";
import { sendPaymentRecoveryEmails } from "@/lib/payments/recovery";
import { env, hasDatabase } from "@/lib/env";
import { err } from "@/lib/result";

// Daily abandonment-recovery pass (vercel.json). Same CRON_SECRET guard as
// the other crons; GET for Vercel, POST for a manual trigger.

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
  const result = await sendPaymentRecoveryEmails();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
