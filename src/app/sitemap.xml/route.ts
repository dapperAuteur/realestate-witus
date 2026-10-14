import { listPublicListings } from "@/lib/listings/queries";
import { resolveTenant } from "@/lib/tenant";

// Per-HOST sitemap: each tenant domain advertises only its own pages
// (white-label rule: an agency's sitemap never mentions the platform), plus its
// public listings. The platform host lists BAM's own service listings.

export const dynamic = "force-dynamic";

function url(loc: string, priority: string): string {
  return `<url><loc>${loc}</loc><priority>${priority}</priority></url>`;
}

export async function GET(request: Request) {
  const host = new URL(request.url).host;
  const base = `https://${host}`;
  const tenant = await resolveTenant().catch(() => null);

  const entries: string[] = [];
  if (!tenant || tenant.flags.platform) {
    entries.push(url(`${base}/en`, "1.0"), url(`${base}/en/roadmap`, "0.5"));
  } else if (!tenant.flags.comingSoon && tenant.isActive) {
    entries.push(url(`${base}/en`, "1.0"));
  }
  if (tenant && !tenant.flags.comingSoon && tenant.isActive) {
    // Before migration 0001 runs the listing tables don't exist: list nothing, never 500.
    const listings = await listPublicListings(tenant.id).catch(() => []);
    for (const listing of listings) entries.push(url(`${base}/en/listings/${listing.slug}`, "0.8"));
  }

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`,
    { headers: { "content-type": "application/xml" } },
  );
}
