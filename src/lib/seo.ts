import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelSettings } from "@/db/schema";
import type { TenantRecord } from "@/lib/tenant";

// Per-tenant SEO (workstream 14 core). White-label rule applies: hotel pages
// describe the HOTEL, never Stay.WitUS.

export function tenantMetadata(tenant: TenantRecord): Metadata {
  const name = tenant.theme.name ?? tenant.name;
  const description =
    tenant.tagline ?? `Book your stay at ${name}. Live availability, instant confirmation.`;
  const og = tenant.theme.ogDefaultUrl;
  return {
    // absolute: escapes the root "| Stay.WitUS" template (white-label rule).
    title: { absolute: name, template: `%s | ${name}` },
    description,
    openGraph: {
      title: name,
      description,
      type: "website",
      // Real photo when the owner set one; branded generated card otherwise.
      images: [{ url: og ?? "/og", width: 1200, height: 630 }],
    },
    manifest: "/manifest.webmanifest",
  };
}

/** schema.org Hotel JSON-LD for the tenant homepage. Facts only, all owner-entered. */
export async function hotelJsonLd(tenant: TenantRecord, heroImage?: string) {
  const [settings] = await db()
    .select()
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, tenant.id))
    .limit(1);
  const name = tenant.theme.name ?? tenant.name;
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name,
    ...(tenant.tagline ? { description: tenant.tagline } : {}),
    ...(settings?.address ? { address: settings.address } : {}),
    ...(settings?.phone ? { telephone: settings.phone } : {}),
    ...(settings?.email ? { email: settings.email } : {}),
    ...(heroImage ? { image: [heroImage] } : {}),
    ...(settings?.checkinTime ? { checkinTime: settings.checkinTime } : {}),
    ...(settings?.checkoutTime ? { checkoutTime: settings.checkoutTime } : {}),
  };
}
