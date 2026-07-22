"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, hasAuth } from "@/lib/auth";

export async function signOutAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  if (hasAuth()) {
    await auth()
      .api.signOut({ headers: await headers() })
      .catch(() => null);
  }
  redirect(`/${lang}`);
}
