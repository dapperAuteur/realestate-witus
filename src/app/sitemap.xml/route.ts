import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { roomTypes } from "@/db/schema";
import { resolveTenant } from "@/lib/tenant";

// Per-HOST sitemap: each tenant domain advertises only its own pages
// (white-label rule — a hotel's sitemap never mentions the platform).

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
    entries.push(url(`${base}/en`, "1.0"), url(`${base}/en/book`, "0.9"));
    if (tenant.flags.events) entries.push(url(`${base}/en/events`, "0.6"));
    if (tenant.flags.concierge) entries.push(url(`${base}/en/partners/apply`, "0.3"));
    const rooms = await db()
      .select({ slug: roomTypes.slug })
      .from(roomTypes)
      .where(and(eq(roomTypes.tenantId, tenant.id), eq(roomTypes.isActive, true)))
      .orderBy(asc(roomTypes.sortOrder));
    for (const room of rooms) entries.push(url(`${base}/en/rooms/${room.slug}`, "0.8"));
  }

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`,
    { headers: { "content-type": "application/xml" } },
  );
}
