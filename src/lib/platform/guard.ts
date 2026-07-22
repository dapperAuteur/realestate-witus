import { notFound } from "next/navigation";
import { env, hasDatabase } from "@/lib/env";
import { getSessionUser, platformOwnerExists, type SessionUser } from "@/lib/rbac";

// The /platform gate, shared by every platform page and action: platform
// owner, or the self-closing PLATFORM_BOOTSTRAP window while no owner exists.
// Everyone else sees a 404 — platform surfaces are not advertised.

export async function platformAccess(): Promise<
  { ok: true; user: SessionUser | null } | { ok: false }
> {
  const user = await getSessionUser().catch(() => null);
  if (user?.isPlatformOwner) return { ok: true, user };
  const bootstrapOpen =
    env.PLATFORM_BOOTSTRAP &&
    hasDatabase &&
    !(await platformOwnerExists().catch(() => true));
  return bootstrapOpen ? { ok: true, user: null } : { ok: false };
}

export async function requirePlatformPage(): Promise<SessionUser | null> {
  const access = await platformAccess();
  if (!access.ok) notFound();
  return access.user;
}
