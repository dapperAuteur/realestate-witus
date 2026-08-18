import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Multi-tenant: pages resolve the tenant from the request Host header at
  // runtime (src/lib/tenant.ts), so responses must not be statically shared
  // across hosts. Tenant-facing routes opt into dynamic rendering themselves.
  poweredByHeader: false,

  // PostHog's endpoints use trailing slashes (/e/, /flags/, /s/). Without this, Next
  // issues a 308 to the slashless form before the rewrite runs and ingest breaks.
  // Required by PostHog's documented Next.js proxy setup.
  //
  // SIDE EFFECT worth knowing: this disables Next's automatic trailing-slash redirect
  // for EVERY route, not just /ingest — /en/roadmap/ no longer 308s to /en/roadmap and
  // both forms become reachable. No page in this app currently sets
  // `alternates.canonical` (src/lib/seo.ts builds per-tenant metadata without one), so
  // the duplicate form is unclaimed. What limits the damage today is the per-host
  // sitemap (src/app/sitemap.xml/route.ts), which advertises only the slashless form
  // and is a canonical signal in its own right; nothing links to the slashed form.
  // Adding `alternates.canonical` is the real fix and matters MORE once the listings
  // workstream ships public, indexable listing pages — do it there. See witus plans/26.
  skipTrailingSlashRedirect: true,

  async rewrites() {
    // Reverse-proxy PostHog through our own origin. us.i.posthog.com is on uBlock
    // Origin, Brave Shields, and Safari's tracker list, so a meaningful share of
    // events never leave the browser — including, reliably, our own test visits.
    // Routing ingest through the host the visitor is already on leaves blockers nothing
    // to match on, which matters doubly here: on an agency's own domain, a request to a
    // vendor hostname is also a white-label leak.
    //
    // Assets come from a different upstream host than ingest, hence two rules. The
    // more specific /static rule must come first.
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
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
  webpack: {
    // Strips the SDK's own debug logging from the bundle. Replaces the deprecated top-level
    // `disableLogger` option. Webpack-only, so it is a no-op under Turbopack (same as the old
    // flag was), but it silences the v10 deprecation warning.
    treeshake: { removeDebugLogging: true },
  },
});
