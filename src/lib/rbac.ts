import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { tenantMemberships, users, type TenantRole } from "@/db/schema";
import { auth, hasAuth } from "@/lib/auth";

// Per-tenant RBAC over tenant_memberships. Staff hierarchy is linear
// (owner > manager > front_desk); partner and guest are lanes of their own,
// never implied by a staff role.

const STAFF_RANK: Partial<Record<TenantRole, number>> = {
  front_desk: 1,
  manager: 2,
  owner: 3,
};

/** owner covers manager covers front_desk; partner/guest match only exactly. */
export function roleSatisfies(actual: TenantRole, required: TenantRole): boolean {
  const actualRank = STAFF_RANK[actual];
  const requiredRank = STAFF_RANK[required];
  if (actualRank !== undefined && requiredRank !== undefined) {
    return actualRank >= requiredRank;
  }
  return actual === required;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isPlatformOwner: boolean;
}

/** Session for this request, memoized. Null when signed out or auth unset. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!hasAuth()) return null;
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & { isPlatformOwner?: boolean };
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    isPlatformOwner: u.isPlatformOwner === true,
  };
});

export async function getMembership(
  tenantId: string,
  userId: string,
): Promise<TenantRole | null> {
  const [row] = await db()
    .select({ role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId),
      ),
    )
    .limit(1);
  return (row?.role as TenantRole) ?? null;
}

/**
 * The signed-in user's role on this tenant, or null when signed out / not a
 * member. The platform owner passes every tenant check (BAM operates all
 * properties' support).
 */
export async function requireRole(
  tenantId: string,
  required: TenantRole,
): Promise<{ user: SessionUser; role: TenantRole } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.isPlatformOwner) return { user, role: "owner" };
  const role = await getMembership(tenantId, user.id);
  if (!role || !roleSatisfies(role, required)) return null;
  return { user, role };
}

/** True once any platform owner exists — flips the bootstrap window closed. */
export async function platformOwnerExists(): Promise<boolean> {
  const [row] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isPlatformOwner, true))
    .limit(1);
  return Boolean(row);
}
