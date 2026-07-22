import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, type TenantTheme } from "@/db/schema";
import { normalizeBrandPreset } from "@/lib/brand-presets";
import { normalizeFontPair } from "@/lib/font-pairs";
import { normalizeTemplate } from "@/lib/templates";
import { err, ok, type Result } from "@/lib/result";

// The /admin/design write chokepoint. Everything client-supplied is normalized
// against the curated registries before it touches tenants.theme — unknown
// keys collapse to defaults, never to an error page or stored junk.

export interface DesignUpdateInput {
  templateKey?: string;
  presetKey?: string;
  fontPairKey?: string;
}

export function normalizeDesignInput(input: DesignUpdateInput): Partial<TenantTheme> {
  const patch: Partial<TenantTheme> = {};

  if (input.templateKey !== undefined) {
    patch.templateKey = normalizeTemplate(input.templateKey) ?? undefined;
  }
  if (input.presetKey !== undefined) {
    patch.presetKey = normalizeBrandPreset(input.presetKey) ?? undefined;
  }
  if (input.fontPairKey !== undefined) {
    patch.fontPairKey = normalizeFontPair(input.fontPairKey) ?? undefined;
  }
  return patch;
}

export async function updateTenantDesign(
  tenantId: string,
  input: DesignUpdateInput,
): Promise<Result<TenantTheme>> {
  const patch = normalizeDesignInput(input);
  const [current] = await db()
    .select({ theme: tenants.theme })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!current) return err("TENANT_NOT_FOUND", "Tenant not found.");

  const theme: TenantTheme = { ...current.theme, ...patch };
  await db()
    .update(tenants)
    .set({ theme, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
  return ok(theme);
}
