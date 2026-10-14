import { NextResponse } from "next/server";
import { submitInquiry } from "@/lib/listings/inquiries";
import { isListingSlug } from "@/lib/listings/slug";
import { err } from "@/lib/result";
import { resolveTenant } from "@/lib/tenant";

// A buyer's tour request or question, from the listing page or the embed
// (both same-origin on the agency's host). Envelope responses; the listing
// must be public on THIS host's tenant.

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || !isListingSlug(slug)) {
    return NextResponse.json(err("LISTING_NOT_FOUND", "This listing is not available."), { status: 404 });
  }
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(err("BAD_REQUEST", "Send the form as JSON."), { status: 400 });
  }
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const result = await submitInquiry({ tenant, slug, raw, origin: `${proto}://${host}` });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.code === "LISTING_NOT_FOUND" ? 404 : 400 });
  }
  return NextResponse.json(result);
}
