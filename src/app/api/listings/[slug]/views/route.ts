import { NextResponse } from "next/server";
import { findListing, recordListingView } from "@/lib/listings/queries";
import { isListingSlug } from "@/lib/listings/slug";
import { resolveTenant } from "@/lib/tenant";

// Page views and tour openings, counted per listing per day per surface
// (plans/08 section 7). Sent with navigator.sendBeacon, so the body may arrive
// as text. Nothing about the visitor is stored. Always 204: a counter must
// never surface an error to a buyer.

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const done = new NextResponse(null, { status: 204 });
  const { slug } = await params;
  if (!isListingSlug(slug) || BOT.test(request.headers.get("user-agent") ?? "")) return done;

  const body = (await request
    .text()
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => null)) ?? {};
  const event = body.event === "tour" ? "tour" : body.event === "page" ? "page" : null;
  const surface = body.surface === "embed" ? "embed" : "page";
  if (!event) return done;

  try {
    const tenant = await resolveTenant();
    const listing = tenant ? await findListing(tenant.id, slug) : null;
    if (tenant && listing) {
      await recordListingView({
        tenantId: tenant.id,
        listingId: listing.id,
        surface,
        event,
        day: new Date().toISOString().slice(0, 10),
      });
    }
  } catch (error) {
    console.error("[views] count failed", { slug, error });
  }
  return done;
}
