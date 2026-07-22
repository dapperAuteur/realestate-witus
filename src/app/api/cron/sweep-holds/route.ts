import { NextResponse } from "next/server";
import { sweepExpiredHolds } from "@/lib/booking/holds";
import { env, hasDatabase } from "@/lib/env";
import { err } from "@/lib/result";

// Daily hygiene sweep (vercel.json cron). Availability reads filter expired
// holds lazily and the claim path releases colliders, so correctness never
// waits on this — it only keeps unit_claims tidy.

export async function GET(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    return NextResponse.json(err("UNAUTHORIZED", "Invalid cron secret."), {
      status: 401,
    });
  }
  if (!hasDatabase) {
    return NextResponse.json(err("NO_DATABASE", "DATABASE_URL is not set."), {
      status: 503,
    });
  }
  const result = await sweepExpiredHolds();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
