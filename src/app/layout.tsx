import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Stay.WitUS", template: "%s | Stay.WitUS" },
  description:
    "Hotel websites with booking, concierge, and guest messaging. A WitUS platform.",
  openGraph: {
    title: "Stay.WitUS",
    description:
      "Hotel websites with booking, concierge, and guest messaging. A WitUS platform.",
    type: "website",
    images: [{ url: "/og", width: 1200, height: 630 }],
  },
  manifest: "/manifest.webmanifest",
  // Ecosystem favicon: 02-duality variant (gemini/witus/public/brand/README.md) —
  // the one variant that carries contrast on light tabs. Platform surface only;
  // hotel tenants get tenants.theme.faviconUrl once per-tenant metadata lands.
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
        <Analytics />
      </body>
    </html>
  );
}
