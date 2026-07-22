import type { Metadata } from "next";
import type { TenantRecord } from "@/lib/tenant";

// Per-tenant SEO. White-label rule applies: an agency's pages describe the
// AGENCY and its listings, never RealEstate.WitUS.

export function tenantMetadata(tenant: TenantRecord): Metadata {
  const name = tenant.theme.name ?? tenant.name;
  const description = tenant.tagline ?? `Explore listings from ${name}.`;
  const og = tenant.theme.ogDefaultUrl;
  return {
    // absolute: escapes the root "| RealEstate.WitUS" template (white-label rule).
    title: { absolute: name, template: `%s | ${name}` },
    description,
    openGraph: {
      title: name,
      description,
      type: "website",
      // Real photo when the agency set one; branded generated card otherwise.
      images: [{ url: og ?? "/og", width: 1200, height: 630 }],
    },
    manifest: "/manifest.webmanifest",
  };
}
