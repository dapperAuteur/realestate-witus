"use server";

import { redirect } from "next/navigation";
import { platformAccess } from "@/lib/platform/guard";
import { PROMO_BANNER_KEY, setGlobalSetting } from "@/lib/platform/settings";

export async function savePromoBannerAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const access = await platformAccess();
  if (!access.ok) redirect(`/${lang}/sign-in`);
  const text = String(formData.get("bannerText") ?? "").trim();
  await setGlobalSetting(PROMO_BANNER_KEY, text || null);
  redirect(`/${lang}/platform?ok=1`);
}
