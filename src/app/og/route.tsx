import { ImageResponse } from "next/og";
import { presetByKey } from "@/lib/brand-presets";
import { resolveTenant } from "@/lib/tenant";

// Per-tenant Open Graph card, generated from the brand: accent panel, hotel
// name in large type, tagline. Hotels that upload theme.ogDefaultUrl skip
// this (tenantMetadata prefers the real photo); this is the guaranteed-good
// fallback so shared links never look broken.

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await resolveTenant().catch(() => null);
  const isPlatform = !tenant || tenant.flags.platform;
  const name = isPlatform ? "Stay.WitUS" : (tenant.theme.name ?? tenant.name);
  const tagline = isPlatform
    ? "Hotel websites that take bookings themselves"
    : (tenant.tagline ?? "Book your stay");
  const preset = presetByKey(tenant?.theme.presetKey);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 72,
          background: `linear-gradient(135deg, ${preset.accent} 0%, #0f172a 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", width: 96, height: 6, background: "#ffffff" }} />
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 700,
            marginTop: 28,
            lineHeight: 1.05,
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 34, marginTop: 18, opacity: 0.9 }}>
          {tagline}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
