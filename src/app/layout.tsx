import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RealEstate.WitUS.Online", template: "%s | RealEstate.WitUS" },
  description:
    "Virtual tours for real estate that is for sale. Branded listing pages with embeds agents own. A WitUS platform.",
  openGraph: {
    title: "RealEstate.WitUS.Online",
    description:
      "Virtual tours for real estate that is for sale. Branded listing pages with embeds agents own. A WitUS platform.",
    type: "website",
    images: [{ url: "/og", width: 1200, height: 630 }],
  },
  manifest: "/manifest.webmanifest",
  // Ecosystem favicon: 02-duality variant (gemini/witus/public/brand/README.md) —
  // the one variant that carries contrast on light tabs. Platform surface only;
  // agency tenants get tenants.theme.faviconUrl once per-tenant metadata lands.
  icons: {
    icon: [
      { url: "/brand/witus/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/witus/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/witus/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/brand/witus/favicon-180.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
        <PostHogProvider
          // Read here, in a Server Component, and passed down — rather than reading
          // process.env inside the client component — so the env surface stays in one
          // place. `?? null` is meaningful: it is what puts the provider in its
          // supported keyless state instead of initialising with `undefined`, so this
          // ships dark until BAM sets the vars on the Vercel project.
          apiKey={process.env.NEXT_PUBLIC_POSTHOG_KEY ?? null}
          // "/ingest" is proxied to PostHog by next.config.ts so ad blockers can't drop
          // events and an agency's own domain never makes a visible vendor request.
          // NEXT_PUBLIC_POSTHOG_HOST stays the source of truth for the real upstream
          // host and is used for server-side capture, not the browser.
          apiHost="/ingest"
        />
        {/* Vercel Web Analytics: cookieless pageview counts + Web Vitals, no consent
            surface. Complements PostHog (which owns product events, witus plan 26)
            rather than replacing it. Sends nothing until Web Analytics is ENABLED on
            the Vercel project. */}
        <Analytics />
      </body>
    </html>
  );
}
