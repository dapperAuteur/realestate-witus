import { presetByKey } from "@/lib/brand-presets";
import { resolveTenant } from "@/lib/tenant";

// Per-HOST web app manifest: each hotel installs under its own name and
// accent (white-label rule); the platform host stays Stay.WitUS.

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await resolveTenant().catch(() => null);
  const isPlatform = !tenant || tenant.flags.platform;
  const name = isPlatform ? "Stay.WitUS" : (tenant.theme.name ?? tenant.name);
  const preset = presetByKey(tenant?.theme.presetKey);

  return Response.json(
    {
      name,
      short_name: tenant?.theme.shortName ?? name,
      start_url: "/en",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: tenant?.theme.themeColor ?? preset.accent,
      icons: isPlatform
        ? [{ src: "/brand/witus/favicon-180.png", sizes: "180x180", type: "image/png" }]
        : tenant?.theme.faviconUrl
          ? [{ src: tenant.theme.faviconUrl, sizes: "180x180", type: "image/png" }]
          : [],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
