import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, withTx } from "@/db";
import {
  mediaAssets,
  supportMessages,
  supportThreads,
  tenants,
  type SupportAttachment,
} from "@/db/schema";
import { deliveryUrl } from "@/lib/media/cloudinary";
import { err, ok, type Result } from "@/lib/result";
import { sendToInbox } from "@/lib/witus-inbox";

// Support (workstream 11, lifted from wanderlearn's model): hotel STAFF open
// threads; BAM answers cross-tenant from /platform/support. Lifecycle:
// open <-> waiting_admin/waiting_user -> resolved_pending_confirm ->
// confirmed | disputed (dispute reopens the admin queue). Guests never see
// this - their channel is the hotel itself.

export type ThreadStatus =
  | "open"
  | "waiting_user"
  | "waiting_admin"
  | "resolved_pending_confirm"
  | "resolved_user_confirmed"
  | "resolved_user_disputed"
  | "closed";

const RECORDING_RE = /^https:\/\/\S+$/;

function normalizeAttachments(
  recordingUrl?: string,
): SupportAttachment[] | undefined {
  const url = recordingUrl?.trim();
  if (!url) return undefined;
  if (!RECORDING_RE.test(url)) return undefined;
  return [{ kind: "recording_link", url }];
}

export async function createThread(args: {
  tenantId: string;
  userId: string;
  subject: string;
  category:
    | "bug"
    | "ui_ux"
    | "feature_request"
    | "question"
    | "content"
    | "billing"
    | "other";
  body: string;
  recordingUrl?: string;
  /** media_assets.id from the signed-upload flow; tenant-verified below. */
  screenshotMediaId?: string;
}): Promise<Result<{ threadId: string }>> {
  if (!args.subject.trim()) return err("INVALID_SUBJECT", "Give it a subject.");
  if (!args.body.trim()) return err("INVALID_BODY", "Describe the issue.");
  if (args.recordingUrl?.trim() && !RECORDING_RE.test(args.recordingUrl.trim())) {
    return err("INVALID_URL", "Recording links must start with https://");
  }

  // Screenshot must belong to THIS tenant or it silently drops.
  let screenshot: SupportAttachment | null = null;
  if (args.screenshotMediaId) {
    const [asset] = await db()
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, args.screenshotMediaId),
          eq(mediaAssets.tenantId, args.tenantId),
          eq(mediaAssets.status, "ready"),
        ),
      )
      .limit(1);
    if (asset) screenshot = { kind: "screenshot", mediaId: asset.id };
  }

  const result = await withTx(async (tx) => {
    const [thread] = await tx
      .insert(supportThreads)
      .values({
        tenantId: args.tenantId,
        userId: args.userId,
        subject: args.subject.trim(),
        category: args.category,
        status: "waiting_admin",
      })
      .returning({ id: supportThreads.id });
    await tx.insert(supportMessages).values({
      threadId: thread.id,
      authorId: args.userId,
      authorRole: "user",
      body: args.body.trim(),
      attachments: [
        ...(normalizeAttachments(args.recordingUrl) ?? []),
        ...(screenshot ? [screenshot] : []),
      ].slice(0, 4) || undefined,
    });
    return ok({ threadId: thread.id });
  });

  if (result.ok) {
    // Operator heads-up; content stays out of the payload (PII rule).
    await sendToInbox("support.thread.created", {
      threadId: result.data.threadId,
      tenantId: args.tenantId,
      category: args.category,
    });
  }
  return result;
}

export async function addMessage(args: {
  threadId: string;
  authorId: string;
  authorRole: "user" | "admin";
  body: string;
  recordingUrl?: string;
}): Promise<Result<{ messageId: string }>> {
  if (!args.body.trim()) return err("INVALID_BODY", "Write a message.");
  return withTx(async (tx) => {
    const [thread] = await tx
      .select({ id: supportThreads.id, status: supportThreads.status })
      .from(supportThreads)
      .where(eq(supportThreads.id, args.threadId))
      .for("update")
      .limit(1);
    if (!thread || thread.status === "closed") {
      return err("THREAD_CLOSED", "This thread is closed.");
    }
    const [message] = await tx
      .insert(supportMessages)
      .values({
        threadId: args.threadId,
        authorId: args.authorId,
        authorRole: args.authorRole,
        body: args.body.trim(),
        attachments: normalizeAttachments(args.recordingUrl),
      })
      .returning({ id: supportMessages.id });
    await tx
      .update(supportThreads)
      .set({
        status: args.authorRole === "admin" ? "waiting_user" : "waiting_admin",
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportThreads.id, args.threadId));
    return ok({ messageId: message.id });
  });
}

export async function listThreadsForUser(tenantId: string, userId: string) {
  return db()
    .select()
    .from(supportThreads)
    .where(
      and(eq(supportThreads.tenantId, tenantId), eq(supportThreads.userId, userId)),
    )
    .orderBy(desc(supportThreads.lastMessageAt));
}

/** Cross-tenant admin queue: actionable first, then recent. */
export async function listThreadsAdmin() {
  return db()
    .select({ thread: supportThreads, tenantName: tenants.name })
    .from(supportThreads)
    .innerJoin(tenants, eq(supportThreads.tenantId, tenants.id))
    .orderBy(
      sql`case ${supportThreads.status}
        when 'waiting_admin' then 0
        when 'resolved_user_disputed' then 1
        when 'open' then 2
        else 3 end`,
      desc(supportThreads.lastMessageAt),
    )
    .limit(100);
}

/** Guarded fetch: the opener (scoped to tenant) or the platform admin. */
export async function getThread(args: {
  threadId: string;
  viewer: { userId: string; isPlatformAdmin: boolean; tenantId?: string };
}) {
  const guard = args.viewer.isPlatformAdmin
    ? eq(supportThreads.id, args.threadId)
    : and(
        eq(supportThreads.id, args.threadId),
        eq(supportThreads.userId, args.viewer.userId),
        eq(supportThreads.tenantId, args.viewer.tenantId ?? ""),
      );
  const [thread] = await db().select().from(supportThreads).where(guard).limit(1);
  if (!thread) return null;
  const rawMessages = await db()
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.threadId, thread.id))
    .orderBy(supportMessages.createdAt);
  // Resolve screenshot mediaIds to delivery URLs (owner-tenant assets only).
  const mediaIds = rawMessages.flatMap(
    (message) =>
      message.attachments
        ?.filter((a) => a.kind === "screenshot" && a.mediaId)
        .map((a) => a.mediaId as string) ?? [],
  );
  const assets = mediaIds.length
    ? await db()
        .select({ id: mediaAssets.id, publicId: mediaAssets.cloudinaryPublicId })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.tenantId, thread.tenantId),
            sql`${mediaAssets.id} in ${mediaIds}`,
          ),
        )
    : [];
  const urlById = new Map(
    assets.map((asset) => [asset.id, deliveryUrl(asset.publicId, { width: 800 })]),
  );
  const messages = rawMessages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) =>
      attachment.kind === "screenshot" && attachment.mediaId
        ? { ...attachment, url: urlById.get(attachment.mediaId) ?? undefined }
        : attachment,
    ),
  }));
  // Seen stamps for the OTHER side's unread badge.
  const seenColumn = args.viewer.isPlatformAdmin
    ? { seenByAdminAt: new Date() }
    : { seenByUserAt: new Date() };
  await db()
    .update(supportMessages)
    .set(seenColumn)
    .where(
      and(
        eq(supportMessages.threadId, thread.id),
        args.viewer.isPlatformAdmin
          ? sql`${supportMessages.seenByAdminAt} is null`
          : sql`${supportMessages.seenByUserAt} is null`,
      ),
    );
  return { thread, messages };
}

export async function resolveThread(threadId: string): Promise<Result<{ ok: true }>> {
  const rows = await db()
    .update(supportThreads)
    .set({
      status: "resolved_pending_confirm",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(supportThreads.id, threadId),
        or(
          eq(supportThreads.status, "open"),
          eq(supportThreads.status, "waiting_admin"),
          eq(supportThreads.status, "waiting_user"),
          eq(supportThreads.status, "resolved_user_disputed"),
        ),
      ),
    )
    .returning({ id: supportThreads.id });
  if (rows.length === 0) return err("NOT_FOUND", "Thread not found or not open.");
  return ok({ ok: true });
}

/** The opener confirms the fix, or disputes it (which reopens the queue). */
export async function confirmResolution(args: {
  threadId: string;
  tenantId: string;
  userId: string;
  confirmed: boolean;
  disputeReason?: string;
}): Promise<Result<{ ok: true }>> {
  const rows = await db()
    .update(supportThreads)
    .set(
      args.confirmed
        ? {
            status: "resolved_user_confirmed",
            userConfirmedAt: new Date(),
            userConfirmedPositive: "yes",
            updatedAt: new Date(),
          }
        : {
            status: "resolved_user_disputed",
            userConfirmedAt: new Date(),
            userConfirmedPositive: "no",
            userDisputeReason: args.disputeReason?.trim() || null,
            updatedAt: new Date(),
          },
    )
    .where(
      and(
        eq(supportThreads.id, args.threadId),
        eq(supportThreads.tenantId, args.tenantId),
        eq(supportThreads.userId, args.userId),
        eq(supportThreads.status, "resolved_pending_confirm"),
      ),
    )
    .returning({ id: supportThreads.id });
  if (rows.length === 0) return err("NOT_FOUND", "Nothing awaiting your confirmation.");
  return ok({ ok: true });
}

export async function closeThread(threadId: string): Promise<Result<{ ok: true }>> {
  const rows = await db()
    .update(supportThreads)
    .set({ status: "closed", updatedAt: new Date() })
    .where(and(eq(supportThreads.id, threadId), ne_closed()))
    .returning({ id: supportThreads.id });
  if (rows.length === 0) return err("NOT_FOUND", "Thread not found.");
  return ok({ ok: true });
}

function ne_closed() {
  return sql`${supportThreads.status} <> 'closed'`;
}
