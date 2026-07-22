import { NextResponse } from "next/server";
import { ok } from "@/lib/result";
import { hasDatabase, hasMailgun } from "@/lib/env";

export function GET() {
  return NextResponse.json(
    ok({
      service: "stay-witus",
      database: hasDatabase,
      mailgun: hasMailgun,
    }),
  );
}
