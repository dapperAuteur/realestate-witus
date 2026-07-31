import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Multi-tenant: pages resolve the tenant from the request Host header at
  // runtime (src/lib/tenant.ts), so responses must not be statically shared
  // across hosts. Tenant-facing routes opt into dynamic rendering themselves.
  poweredByHeader: false,
};

// Wrap with Sentry's build plugin, which is what feeds Better Stack (it ingests over the Sentry
// protocol). Safe with no Sentry env set: without SENTRY_AUTH_TOKEN it simply skips source-map
// upload, so you just get minified stack traces, and the runtime SDK stays inert without a DSN.
// org/project/authToken come from env so nothing secret is committed here.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
