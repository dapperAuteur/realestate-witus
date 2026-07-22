"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, hasAuth } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Requests a magic link and lands back on the form with a status flag.
 * Always redirects to "sent" for valid addresses — whether or not an account
 * exists — so the form never leaks who has one.
 */
export async function requestMagicLink(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const email = String(formData.get("email") ?? "").trim();

  if (!EMAIL_RE.test(email)) {
    redirect(`/${lang}/sign-in?status=invalid`);
  }
  if (!hasAuth()) {
    redirect(`/${lang}/sign-in?status=unavailable`);
  }

  await auth().api.signInMagicLink({
    body: { email, callbackURL: `/${lang}` },
    headers: await headers(),
  });

  redirect(`/${lang}/sign-in?status=sent`);
}
