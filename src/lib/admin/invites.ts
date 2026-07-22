import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, withTx } from "@/db";
import {
  staffInvites,
  tenantMemberships,
  tenants,
  users,
  type TenantRole,
} from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { sendEmail } from "@/lib/mailer";

// Staff invites: the owner emails a single-use, expiring link; accepting
// requires signing in with THE SAME email (tokens cannot be forwarded to a
// different account). Roles are staff-only — partners and guests arrive
// through their own flows.

const INVITE_TTL_DAYS = 7;
const STAFF_ROLES: TenantRole[] = ["owner", "manager", "front_desk"];

export interface CreateInviteInput {
  tenantId: string;
  email: string;
  role: TenantRole;
  invitedBy: string;
  /** Absolute URL prefix for the accept link, e.g. https://hotel.com/en/invite */
  acceptUrlBase: string;
}

export async function createStaffInvite(
  input: CreateInviteInput,
): Promise<Result<{ inviteId: string }>> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err("INVALID_EMAIL", "That does not look like an email address.");
  }
  if (!STAFF_ROLES.includes(input.role)) {
    return err("INVALID_ROLE", "Staff roles are owner, manager, or front desk.");
  }

  const token = randomBytes(24).toString("base64url");
  const [invite] = await db()
    .insert(staffInvites)
    .values({
      tenantId: input.tenantId,
      email,
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    })
    .returning({ id: staffInvites.id });

  const [tenant] = await db()
    .select({ name: tenants.name, email: tenants.email })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);
  await sendEmail({
    to: email,
    from: tenant?.email.from,
    subject: `You are invited to help run ${tenant?.name ?? "a property"}`,
    text: [
      `You have been invited to join ${tenant?.name ?? "a property"} as ${input.role.replace("_", " ")}.`,
      "",
      `Accept here (sign in with this email address): ${input.acceptUrlBase}/${token}`,
      "",
      `The link expires in ${INVITE_TTL_DAYS} days. If you were not expecting it, ignore this email.`,
    ].join("\n"),
  });

  return ok({ inviteId: invite.id });
}

export async function revokeStaffInvite(
  tenantId: string,
  inviteId: string,
): Promise<Result<{ revoked: boolean }>> {
  const rows = await db()
    .delete(staffInvites)
    .where(
      and(
        eq(staffInvites.id, inviteId),
        eq(staffInvites.tenantId, tenantId),
        isNull(staffInvites.acceptedAt),
      ),
    )
    .returning({ id: staffInvites.id });
  return ok({ revoked: rows.length > 0 });
}

/**
 * Accepts an invite for the signed-in user. Email must match the invite
 * (case-insensitive) so a leaked token is useless to anyone else.
 */
export async function acceptStaffInvite(
  token: string,
  user: { id: string; email: string },
): Promise<Result<{ tenantId: string; role: TenantRole }>> {
  return withTx(async (tx) => {
    const [invite] = await tx
      .select()
      .from(staffInvites)
      .where(eq(staffInvites.token, token))
      .for("update")
      .limit(1);
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return err("INVITE_INVALID", "This invite has expired or was already used.");
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return err(
        "WRONG_ACCOUNT",
        "Sign in with the email address the invite was sent to.",
      );
    }

    await tx
      .insert(tenantMemberships)
      .values({
        tenantId: invite.tenantId,
        userId: user.id,
        role: invite.role,
      })
      .onConflictDoUpdate({
        target: [tenantMemberships.tenantId, tenantMemberships.userId],
        set: { role: invite.role },
      });
    await tx
      .update(staffInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(staffInvites.id, invite.id));

    return ok({ tenantId: invite.tenantId, role: invite.role as TenantRole });
  });
}

export async function listTeam(tenantId: string) {
  const [members, pending] = await Promise.all([
    db()
      .select({
        userId: tenantMemberships.userId,
        role: tenantMemberships.role,
        email: users.email,
        name: users.name,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(tenantMemberships.userId, users.id))
      .where(eq(tenantMemberships.tenantId, tenantId))
      .orderBy(asc(users.email)),
    db()
      .select({
        id: staffInvites.id,
        email: staffInvites.email,
        role: staffInvites.role,
        expiresAt: staffInvites.expiresAt,
      })
      .from(staffInvites)
      .where(
        and(eq(staffInvites.tenantId, tenantId), isNull(staffInvites.acceptedAt)),
      )
      .orderBy(asc(staffInvites.email)),
  ]);
  return { members, pending };
}
