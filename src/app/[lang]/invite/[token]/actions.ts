"use server";

import { redirect } from "next/navigation";
import { acceptStaffInvite } from "@/lib/admin/invites";
import { getSessionUser } from "@/lib/rbac";
import { resolveTenant } from "@/lib/tenant";

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const token = String(formData.get("token") ?? "");

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) redirect(`/${lang}`);
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect(`/${lang}/sign-in`);

  const result = await acceptStaffInvite(token, {
    id: user.id,
    email: user.email,
  });
  if (!result.ok) {
    redirect(`/${lang}/invite/${encodeURIComponent(token)}?error=${result.code}`);
  }
  // Accepted on the wrong hotel's domain: the membership (scoped to the
  // invite's own tenant) is fine, but /admin here would 404 — send home.
  if (result.data.tenantId !== tenant.id) {
    redirect(`/${lang}`);
  }
  redirect(`/${lang}/admin`);
}
