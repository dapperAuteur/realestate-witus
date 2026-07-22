"use server";

import { redirect } from "next/navigation";
import { platformAccess } from "@/lib/platform/guard";
import {
  addTenantDomain,
  removeTenantDomain,
} from "@/lib/platform/domains";
import { attachDomain, detachDomain } from "@/lib/vercel-domains";
import { writeAudit } from "@/lib/audit";

// Platform-owner actions. DB mapping first (source of truth for tenant
// resolution), then the Vercel leg; a Vercel hiccup leaves a working DB row
// plus an error flag, never a half-state the UI can't see.

async function guard(lang: string): Promise<void> {
  const access = await platformAccess();
  if (!access.ok) redirect(`/${lang}/sign-in`);
}

export async function addDomainAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const base = `/${lang}/platform/domains`;
  await guard(lang);

  const mapped = await addTenantDomain(
    String(formData.get("tenantId") ?? ""),
    String(formData.get("host") ?? ""),
  );
  if (!mapped.ok) {
    redirect(`${base}?error=${encodeURIComponent(mapped.code)}`);
  }
  await writeAudit({
    tenantId: String(formData.get("tenantId") ?? "") || null,
    kind: "admin.domain.add",
    summary: `Domain mapped: ${mapped.data.host}`,
  });
  const vercel = await attachDomain(mapped.data.host);
  if (!vercel.ok) {
    redirect(
      `${base}?host=${encodeURIComponent(mapped.data.host)}&error=VERCEL_ATTACH`,
    );
  }
  redirect(`${base}?host=${encodeURIComponent(mapped.data.host)}&ok=1`);
}

export async function checkDomainAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  await guard(lang);
  const host = String(formData.get("host") ?? "");
  // Attach first (idempotent): a DB-seeded mapping may never have reached
  // Vercel, and without attachment there is no certificate — the exact
  // failure BAM hit with the demo domain. Verify happens on render.
  await attachDomain(host).catch(() => null);
  redirect(`/${lang}/platform/domains?host=${encodeURIComponent(host)}`);
}

export async function removeDomainAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const base = `/${lang}/platform/domains`;
  await guard(lang);

  const removed = await removeTenantDomain(
    String(formData.get("tenantId") ?? ""),
    String(formData.get("domainId") ?? ""),
  );
  if (!removed.ok) {
    redirect(`${base}?error=${encodeURIComponent(removed.code)}`);
  }
  if (removed.data.host) await detachDomain(removed.data.host);
  await writeAudit({
    tenantId: String(formData.get("tenantId") ?? "") || null,
    kind: "admin.domain.remove",
    summary: `Domain removed: ${removed.data.host ?? "?"}`,
  });
  redirect(`${base}?ok=1`);
}
