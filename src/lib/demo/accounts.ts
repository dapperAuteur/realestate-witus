import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, tenantMemberships, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env, hasDemoLogin } from "@/lib/env";
import { err, ok, type Result } from "@/lib/result";
import {
  demoTenantHasContent,
  ensureDemoTenant,
  seedDemoContent,
  wipeDemoContent,
} from "./seed";

// Demo accounts + the nightly reset (plans/07, emulating witus-learn).
// Stable literal user ids so rows are identical across resets. Roles show
// off RBAC: the admin demo is the hotel OWNER (everything), the visitor demo
// is FRONT DESK (operations only — no pricing/design/team). Neither is ever
// a platform owner. Passwords come from env and are re-hashed on every
// ensure, so rotating the env var rotates the login.

const DEMO_ADMIN_ID = "demo-admin";
const DEMO_VISITOR_ID = "demo-visitor";

async function upsertCredentialUser(args: {
  id: string;
  email: string;
  name: string;
  password: string;
  tenantId: string;
  role: "owner" | "front_desk";
}): Promise<void> {
  const ctx = await auth().$context;
  const hash = await ctx.password.hash(args.password);

  await db()
    .insert(users)
    .values({
      id: args.id,
      email: args.email.toLowerCase(),
      name: args.name,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: args.email.toLowerCase(), name: args.name, updatedAt: new Date() },
    });

  // Better Auth credential account (providerId "credential").
  const [existing] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, args.id))
    .limit(1);
  if (existing) {
    await db()
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(eq(accounts.id, existing.id));
  } else {
    await db().insert(accounts).values({
      id: `${args.id}-credential`,
      accountId: args.id,
      providerId: "credential",
      userId: args.id,
      password: hash,
    });
  }

  await db()
    .insert(tenantMemberships)
    .values({ tenantId: args.tenantId, userId: args.id, role: args.role })
    .onConflictDoUpdate({
      target: [tenantMemberships.tenantId, tenantMemberships.userId],
      set: { role: args.role },
    });
}

export async function ensureDemoAccounts(tenantId: string): Promise<Result<null>> {
  if (!hasDemoLogin) {
    return err("DEMO_NOT_CONFIGURED", "Demo accounts are not configured.");
  }
  await upsertCredentialUser({
    id: DEMO_ADMIN_ID,
    email: env.DEMO_ADMIN_USER_EMAIL as string,
    name: "Demo Owner",
    password: env.DEMO_ADMIN_PASSWORD as string,
    tenantId,
    role: "owner",
  });
  await upsertCredentialUser({
    id: DEMO_VISITOR_ID,
    email: env.DEMO_VISITOR_USER_EMAIL as string,
    name: "Demo Front Desk",
    password: env.DEMO_VISITOR_PASSWORD as string,
    tenantId,
    role: "front_desk",
  });
  return ok(null);
}

/**
 * The nightly reset: wipe the demo tenant's content and bookings, restore
 * the baseline (fresh future-dated events every night), re-assert the demo
 * accounts. Strictly scoped to the demo tenant id throughout.
 */
export async function resetDemoData(): Promise<Result<{ tenantId: string }>> {
  const tenantId = await ensureDemoTenant();
  await wipeDemoContent(tenantId);
  await seedDemoContent(tenantId);
  if (hasDemoLogin) {
    await ensureDemoAccounts(tenantId);
  }
  return ok({ tenantId });
}

/** First-time setup path used by the seed script (no wipe if content exists). */
export async function setupDemo(): Promise<Result<{ tenantId: string; seeded: boolean }>> {
  const tenantId = await ensureDemoTenant();
  const hasContent = await demoTenantHasContent(tenantId);
  if (!hasContent) {
    await seedDemoContent(tenantId);
  }
  if (hasDemoLogin) {
    await ensureDemoAccounts(tenantId);
  }
  return ok({ tenantId, seeded: !hasContent });
}
