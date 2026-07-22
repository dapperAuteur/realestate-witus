// Support lifecycle against Neon (skips without a DB URL): create → admin
// reply → resolve → dispute (reopens) → resolve → confirm; guards hold.
// Throwaway tenant + user, cleaned in afterAll.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { mediaAssets, tenants, users } from "@/db/schema";
import {
  addMessage,
  closeThread,
  confirmResolution,
  createThread,
  getThread,
  listThreadsAdmin,
  listThreadsForUser,
  resolveThread,
} from "./support";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("support lifecycle against Neon", () => {
  const userId = `itest-sup-${randomUUID().slice(0, 8)}`;
  let tenantId: string;
  let threadId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-sup-${randomUUID().slice(0, 8)}`, name: "Support Test Hotel" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
    await db().insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
      name: "Support Tester",
    });
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
    await db().delete(users).where(eq(users.id, userId));
  });

  it("screenshot attachments: own-tenant enriched with URL, foreign dropped", async () => {
    const [asset] = await db()
      .insert(mediaAssets)
      .values({
        tenantId,
        cloudinaryPublicId: `stay-witus/${tenantId}/itest-shot`,
        altText: "Support screenshot",
        status: "ready",
      })
      .returning({ id: mediaAssets.id });

    const withShot = await createThread({
      tenantId,
      userId,
      subject: "With screenshot",
      category: "bug",
      body: "See attached.",
      screenshotMediaId: asset.id,
    });
    expect(withShot.ok).toBe(true);
    if (!withShot.ok) return;
    const view = await getThread({
      threadId: withShot.data.threadId,
      viewer: { userId: "admin", isPlatformAdmin: true },
    });
    const attachment = view?.messages[0].attachments?.find((a) => a.kind === "screenshot");
    expect(attachment?.mediaId).toBe(asset.id);
    expect(attachment && "url" in attachment ? attachment.url : undefined).toContain(
      "res.cloudinary.com",
    );

    // A mediaId from another tenant silently drops (no cross-tenant leaks).
    const foreign = await createThread({
      tenantId,
      userId,
      subject: "Foreign shot",
      category: "bug",
      body: "x",
      screenshotMediaId: randomUUID(),
    });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return;
    const foreignView = await getThread({
      threadId: foreign.data.threadId,
      viewer: { userId: "admin", isPlatformAdmin: true },
    });
    expect(
      foreignView?.messages[0].attachments?.some((a) => a.kind === "screenshot"),
    ).toBeFalsy();
  });

  it("full lifecycle with dispute reopening the queue", async () => {
    expect(
      await createThread({
        tenantId,
        userId,
        subject: "",
        category: "bug",
        body: "x",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_SUBJECT" });

    const created = await createThread({
      tenantId,
      userId,
      subject: "Calendar shows wrong month",
      category: "bug",
      body: "Opening the calendar in August shows July.",
      recordingUrl: "https://loom.example.com/rec/123",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    threadId = created.data.threadId;

    // Opener sees it; a stranger does not; admin does.
    const opener = await listThreadsForUser(tenantId, userId);
    expect(opener.some((t) => t.subject === "Calendar shows wrong month")).toBe(true);
    expect(
      await getThread({
        threadId,
        viewer: { userId: "someone-else", isPlatformAdmin: false, tenantId },
      }),
    ).toBeNull();
    const adminView = await getThread({
      threadId,
      viewer: { userId: "admin", isPlatformAdmin: true },
    });
    expect(adminView?.messages).toHaveLength(1);
    expect(adminView?.messages[0].attachments?.[0]).toMatchObject({
      kind: "recording_link",
    });

    // Admin replies → waiting_user; resolve → pending confirm.
    expect(
      await addMessage({ threadId, authorId: userId, authorRole: "admin", body: "Fixed, please check." }),
    ).toMatchObject({ ok: true });
    expect(await resolveThread(threadId)).toMatchObject({ ok: true });

    // Dispute reopens.
    expect(
      await confirmResolution({
        threadId,
        tenantId,
        userId,
        confirmed: false,
        disputeReason: "Still July on mobile.",
      }),
    ).toMatchObject({ ok: true });
    const queue = await listThreadsAdmin();
    const mine = queue.find((q) => q.thread.id === threadId);
    expect(mine?.thread.status).toBe("resolved_user_disputed");

    // Resolve again → confirm closes the loop.
    expect(await resolveThread(threadId)).toMatchObject({ ok: true });
    expect(
      await confirmResolution({ threadId, tenantId, userId, confirmed: true }),
    ).toMatchObject({ ok: true });

    // No messages after close.
    expect(await closeThread(threadId)).toMatchObject({ ok: true });
    expect(
      await addMessage({ threadId, authorId: userId, authorRole: "user", body: "one more" }),
    ).toMatchObject({ ok: false, code: "THREAD_CLOSED" });
  });
});
