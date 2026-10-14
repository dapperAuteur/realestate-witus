// pnpm seed:tenants — the platform tenant for realestate.witus.online.
// Idempotent by slug: existing tenants are updated in place, never deleted.
// BAM runs this; Claude never seeds production itself.
//
// Only the platform tenant is seeded. BAM's own service listings live on it;
// agency tenants are created from /platform when an engagement starts, so no
// placeholder customer rows exist to clean up later.

import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { tenantDomains, tenants } from "../src/db/schema";

async function upsertTenant(values: typeof tenants.$inferInsert) {
  const [row] = await db()
    .insert(tenants)
    .values(values)
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        name: values.name,
        tagline: values.tagline,
        // Merged, not replaced: flags set from the app (the demo listing
        // choice) must survive a re-seed.
        flags: sql`${tenants.flags} || ${JSON.stringify(values.flags ?? {})}::jsonb`,
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
    slug: "realestate-witus",
    name: "RealEstate.WitUS",
    tagline: "Virtual tours that sell the property before the first showing",
    flags: { platform: true },
    theme: {},
  });
  await ensureDomain(platformId, "realestate.witus.online");
  console.log("platform tenant ready:", platformId);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
