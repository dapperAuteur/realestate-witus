"use server";

import { redirect } from "next/navigation";
import { updatePartnerProfile } from "@/lib/partners";
import { resolveTenant } from "@/lib/tenant";

export async function partnerSelfEditAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const token = String(formData.get("token") ?? "");
  const back = `/${lang}/partner/${encodeURIComponent(token)}`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) redirect(`/${lang}`);

  const result = await updatePartnerProfile(tenant.id, token, {
    blurb: String(formData.get("blurb") ?? ""),
    phone: String(formData.get("phone") ?? "") || undefined,
    whatsappE164: String(formData.get("whatsappE164") ?? "") || undefined,
    priceNote: String(formData.get("priceNote") ?? "") || undefined,
    coverageNote: String(formData.get("coverageNote") ?? "") || undefined,
  });
  if (!result.ok) {
    redirect(`${back}?error=${encodeURIComponent(result.code)}`);
  }
  redirect(`${back}?ok=1`);
}
