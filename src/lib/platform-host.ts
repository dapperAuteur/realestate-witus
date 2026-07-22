import { normalizeHost } from "@/lib/tenant";

// Hosts that render the RealEstate.WitUS platform landing (the product's own site)
// rather than an agency tenant site or the "not configured" notice. Deliberately
// DB-free so the landing works before migrations/seeding — the domain check
// after a fresh deploy must not depend on data.
const PLATFORM_HOSTS = new Set(["realestate.witus.online", "localhost", "127.0.0.1"]);

export function isPlatformHost(rawHost: string | null | undefined): boolean {
  if (!rawHost) return false;
  const host = normalizeHost(rawHost);
  if (PLATFORM_HOSTS.has(host)) return true;
  // Vercel preview/production default URLs for this project.
  return host.endsWith(".vercel.app");
}
