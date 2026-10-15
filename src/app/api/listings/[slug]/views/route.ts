import { NextResponse } from "next/server";
import { findListing, recordListingView, recordRoomStay } from "@/lib/listings/queries";
import { isListingSlug } from "@/lib/listings/slug";
import { resolveTenant } from "@/lib/tenant";
import { parseRoomStay } from "@/lib/tour/room-stays";

// Page views and tour openings, counted per listing per day per surface
// (plans/08 section 7), and time in each room (event "room", room-stays.ts). Sent with navigator.sendBeacon, so the body may arrive
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
  const event = body.event === "tour" ? "tour" : body.event === "page" ? "page" : body.event === "room" ? "room" : null;
  const surface = body.surface === "embed" ? "embed" : "page";
  if (!event) return done;
  const stay = event === "room" ? parseRoomStay(body) : null;
  if (event === "room" && !stay) return done;

  try {
    const tenant = await resolveTenant();
    const listing = tenant ? await findListing(tenant.id, slug) : null;
    const day = new Date().toISOString().slice(0, 10);
    if (tenant && listing && stay) {
      await recordRoomStay({ tenantId: tenant.id, listingId: listing.id, surface, day, stay });
    } else if (tenant && listing && event !== "room") {
      await recordListingView({ tenantId: tenant.id, listingId: listing.id, surface, event, day });
    }
  } catch (error) {
    console.error("[views] count failed", { slug, error });
  }
  return done;
}
