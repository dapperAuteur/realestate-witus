import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multi-tenant: pages resolve the tenant from the request Host header at
  // runtime (src/lib/tenant.ts), so responses must not be statically shared
  // across hosts. Tenant-facing routes opt into dynamic rendering themselves.
  poweredByHeader: false,
};

export default nextConfig;
