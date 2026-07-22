import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { requireRole, type SessionUser } from "@/lib/rbac";
import { resolveTenant, type TenantRecord } from "@/lib/tenant";
import type { TenantRole } from "@/db/schema";

export interface StaffContext {
  tenant: TenantRecord;
  user: SessionUser;
  role: TenantRole;
}

/**
 * Gate for /admin pages: tenant host + a session whose membership satisfies
 * `min` (platform owner passes everything). Null means the caller decides
 * between redirect-to-sign-in (no session) and notFound (wrong role) —
 * pages get that distinction from `reason`.
 */
export const getStaffContext = cache(async (
  min: TenantRole = "front_desk",
): Promise<
  | { ok: true; ctx: StaffContext }
  | { ok: false; reason: "no_tenant" | "no_session" | "forbidden" }
> => {
  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) return { ok: false, reason: "no_tenant" };
  const auth = await requireRole(tenant.id, min).catch(() => null);
  if (!auth) {
    const { getSessionUser } = await import("@/lib/rbac");
    const user = await getSessionUser().catch(() => null);
    return { ok: false, reason: user ? "forbidden" : "no_session" };
  }
  return { ok: true, ctx: { tenant, user: auth.user, role: auth.role } };
});

/**
 * Page/layout entry: resolves staff context or leaves the route the right
 * way — sign-in redirect for missing sessions, 404 otherwise. Pages and the
 * layout MUST both use this: they render concurrently, and a page calling
 * notFound() for a signed-out user would beat the layout's redirect into
 * the stream.
 */
export async function requireStaffPage(
  min: TenantRole,
  lang: string,
): Promise<StaffContext> {
  const gate = await getStaffContext(min);
  if (!gate.ok) {
    if (gate.reason === "no_session") {
      redirect(`/${lang}/sign-in`);
    }
    notFound();
  }
  return gate.ctx;
}
