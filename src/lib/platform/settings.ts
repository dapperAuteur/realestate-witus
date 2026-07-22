import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

// Tiny key/value accessors over platform_settings (tenant_id null = global).
// First consumer: the Lane A promo banner on the platform landing (plans/09).

export const PROMO_BANNER_KEY = "promo_banner_text";
export const PROMO_BANNER_HREF_KEY = "promo_banner_href";

export async function getGlobalSetting(key: string): Promise<string | null> {
  const [row] = await db()
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(and(isNull(platformSettings.tenantId), eq(platformSettings.key, key)))
    .limit(1);
  return row?.value ?? null;
}

export async function setGlobalSetting(
  key: string,
  value: string | null,
): Promise<void> {
  // platform_settings' unique(tenant_id, key) treats NULLs as distinct, so
  // upsert-by-conflict cannot target the global row: do it read-then-write.
  const existing = await db()
    .select({ id: platformSettings.id })
    .from(platformSettings)
    .where(and(isNull(platformSettings.tenantId), eq(platformSettings.key, key)))
    .limit(1);
  if (existing.length > 0) {
    await db()
      .update(platformSettings)
      .set({ value, updatedAt: sql`now()` })
      .where(eq(platformSettings.id, existing[0].id));
  } else {
    await db().insert(platformSettings).values({ key, value });
  }
}
