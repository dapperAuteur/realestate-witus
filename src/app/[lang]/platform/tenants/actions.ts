"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/guard";
import {
  createTenant,
  EDITABLE_FLAGS,
  updateTenantAdmin,
  type EditableFlag,
} from "@/lib/platform/tenants";

async function guard(lang: string): Promise<string | null> {
  const access = await platformAccess();
  if (!access.ok) redirect(`/${lang}/sign-in`);
  return access.user?.id ?? null;
}

export async function createTenantAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/platform/tenants`;
  const actor = await guard(lang);
  const slug = String(formData.get("slug") ?? "");
  const result = await createTenant(slug, String(formData.get("name") ?? ""));
  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.code)}`);
  await writeAudit({
    tenantId: result.data.id,
    actorUserId: actor,
    kind: "admin.tenant.create",
    summary: `Tenant created: ${slug}`,
  });
  redirect(`${back}?ok=1`);
}

export async function updateTenantAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/platform/tenants`;
  const actor = await guard(lang);
  const flags: Partial<Record<EditableFlag, boolean>> = {};
  for (const flag of EDITABLE_FLAGS) {
    flags[flag] = Boolean(formData.get(`flag_${flag}`));
  }
  const tenantId = String(formData.get("tenantId") ?? "");
  const result = await updateTenantAdmin(tenantId, {
    name: String(formData.get("name") ?? ""),
    tagline: String(formData.get("tagline") ?? ""),
    isActive: Boolean(formData.get("isActive")),
    flags,
  });
  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(result.code)}`);
  await writeAudit({
    tenantId,
    actorUserId: actor,
    kind: "admin.tenant.update",
    summary: "Tenant settings/flags updated",
    data: { active: Boolean(formData.get("isActive")) },
  });
  redirect(`${back}?ok=1`);
}
