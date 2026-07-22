// pnpm seed:tenants — the platform tenant + the Osu customer skeleton.
// Idempotent by slug: existing tenants are updated in place, never deleted.
// BAM runs this (user-task 04); Claude never seeds production itself.

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { hotelSettings, tenantDomains, tenants } from "../src/db/schema";

async function upsertTenant(values: typeof tenants.$inferInsert) {
  const [row] = await db()
    .insert(tenants)
    .values(values)
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        name: values.name,
        tagline: values.tagline,
        flags: values.flags,
        theme: values.theme,
        updatedAt: new Date(),
      },
    })
    .returning({ id: tenants.id });
  return row.id;
}

async function ensureDomain(tenantId: string, host: string) {
  await db()
    .insert(tenantDomains)
    .values({ tenantId, host, isPrimary: true })
    .onConflictDoNothing({ target: tenantDomains.host });
}

async function main() {
  const platformId = await upsertTenant({
    slug: "stay-witus",
    name: "Stay.WitUS",
    tagline: "Hotel websites that take bookings themselves",
    flags: { platform: true },
    theme: {},
  });
  await ensureDomain(platformId, "stay.witus.online");
  console.log("platform tenant ready:", platformId);

  // Customer #1 skeleton. BAM renames it and attaches the real domain when
  // the engagement fills in the blanks; comingSoon keeps guests out.
  const osuId = await upsertTenant({
    slug: "osu-hotel",
    name: "Osu Hotel (rename me)",
    tagline: null,
    flags: { comingSoon: true },
    theme: { presetKey: "forest" },
  });
  const [settings] = await db()
    .select({ tenantId: hotelSettings.tenantId })
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, osuId));
  if (!settings) {
    await db().insert(hotelSettings).values({
      tenantId: osuId,
      hotelName: "Osu Hotel (rename me)",
      timezone: "Africa/Accra",
    });
  }
  console.log("osu skeleton ready:", osuId);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
