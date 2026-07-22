import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Admin/platform/api surfaces are not for crawlers on any host.
      { userAgent: "*", allow: "/", disallow: ["/en/admin", "/en/platform", "/api/"] },
    ],
    sitemap: "https://stay.witus.online/sitemap.xml", // per-host route overrides below
  };
}
