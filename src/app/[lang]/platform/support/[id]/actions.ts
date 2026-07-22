"use server";

import { redirect } from "next/navigation";
import { platformAccess } from "@/lib/platform/guard";
import { addMessage, closeThread, resolveThread } from "@/lib/support";

async function guard(lang: string): Promise<string | null> {
  const access = await platformAccess();
  if (!access.ok) redirect(`/${lang}/sign-in`);
  return access.user?.id ?? null;
}

export async function adminReplyAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  const userId = await guard(lang);
  await addMessage({
    threadId,
    // Bootstrap window has no user id; replies need one, so require sign-in.
    authorId: userId ?? redirect(`/${lang}/sign-in`),
    authorRole: "admin",
    body: String(formData.get("body") ?? ""),
  });
  redirect(`/${lang}/platform/support/${threadId}`);
}

export async function resolveThreadAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  await guard(lang);
  await resolveThread(threadId);
  redirect(`/${lang}/platform/support/${threadId}`);
}

export async function closeThreadAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  await guard(lang);
  await closeThread(threadId);
  redirect(`/${lang}/platform/support`);
}
