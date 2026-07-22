"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createStaffInvite, revokeStaffInvite } from "@/lib/admin/invites";
import { updateTenantDesign } from "@/lib/admin/design";
import { getStaffContext, type StaffContext } from "@/lib/admin/guard";
import { claimMomoInvoice } from "@/lib/platform/billing";
import { addMessage, confirmResolution, createThread } from "@/lib/support";
import { writeAudit } from "@/lib/audit";
import type { TenantRole } from "@/db/schema";

// Every action re-guards independently of the page (a stale tab must not
// outlive a revoked membership) and reports back via ?ok/?error redirect
// flags rendered with role=status/alert.

async function guardOr403(min: TenantRole, lang: string): Promise<StaffContext> {
  const gate = await getStaffContext(min);
  if (!gate.ok) redirect(`/${lang}/sign-in`);
  return gate.ctx;
}

function backTo(path: string, flag: "ok" | "error", value: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${flag}=${encodeURIComponent(value)}`);
}

export async function saveDesignAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/design`;
  const ctx = await guardOr403("manager", lang);

  const result = await updateTenantDesign(ctx.tenant.id, {
    templateKey: String(formData.get("templateKey") ?? ""),
    presetKey: String(formData.get("presetKey") ?? ""),
    fontPairKey: String(formData.get("fontPairKey") ?? ""),
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

export async function inviteStaffAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/team`);
  const ctx = await guardOr403("owner", lang);
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const result = await createStaffInvite({
    tenantId: ctx.tenant.id,
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "agent") as never,
    invitedBy: ctx.user.id,
    acceptUrlBase: `${proto}://${host}/${lang}/invite`,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/team`);
  const ctx = await guardOr403("owner", lang);
  await revokeStaffInvite(ctx.tenant.id, String(formData.get("inviteId") ?? ""));
  backTo(back, "ok", "1");
}

export async function claimInvoiceAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/billing`;
  const ctx = await guardOr403("owner", lang);
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await claimMomoInvoice(ctx.tenant.id, invoiceId);
  await writeAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.user.id,
    kind: "billing.invoice.claimed",
    summary: "MoMo payment claimed by owner",
    data: { invoiceId },
  });
  backTo(back, "ok", "1");
}

export async function createThreadAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/support`;
  const ctx = await guardOr403("agent", lang);
  const result = await createThread({
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    subject: String(formData.get("subject") ?? ""),
    category: String(formData.get("category") ?? "question") as Parameters<
      typeof createThread
    >[0]["category"],
    body: String(formData.get("body") ?? ""),
    recordingUrl: String(formData.get("recordingUrl") ?? "") || undefined,
    screenshotMediaId: String(formData.get("screenshotMediaId") ?? "") || undefined,
  });
  if (!result.ok) backTo(back, "error", result.code);
  redirect(`${back}/${result.data.threadId}`);
}

export async function replyThreadAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  const back = `/${lang}/admin/support/${threadId}`;
  const ctx = await guardOr403("agent", lang);
  const result = await addMessage({
    threadId,
    authorId: ctx.user.id,
    authorRole: "user",
    body: String(formData.get("body") ?? ""),
  });
  if (!result.ok) backTo(back, "error", result.code);
  redirect(back);
}

export async function confirmResolutionAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  const back = `/${lang}/admin/support/${threadId}`;
  const ctx = await guardOr403("agent", lang);
  const result = await confirmResolution({
    threadId,
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    confirmed: Boolean(formData.get("confirmed")),
    disputeReason: String(formData.get("disputeReason") ?? "") || undefined,
  });
  if (!result.ok) backTo(back, "error", result.code);
  redirect(back);
}
