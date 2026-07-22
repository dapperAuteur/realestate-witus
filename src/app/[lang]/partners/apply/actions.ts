"use server";

import { redirect } from "next/navigation";
import { submitPartnerApplication, type PartnerCategory } from "@/lib/partners";
import { resolveTenant } from "@/lib/tenant";

export async function applyPartnerAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/partners/apply`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform || !tenant.flags.concierge) {
    redirect(`/${lang}`);
  }

  const result = await submitPartnerApplication(tenant.id, {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "other") as PartnerCategory,
    blurb: String(formData.get("blurb") ?? ""),
    phone: String(formData.get("phone") ?? "") || undefined,
    whatsappE164: String(formData.get("whatsappE164") ?? "") || undefined,
    email: String(formData.get("email") ?? "") || undefined,
    priceNote: String(formData.get("priceNote") ?? "") || undefined,
    coverageNote: String(formData.get("coverageNote") ?? "") || undefined,
    consent: Boolean(formData.get("consent")),
  });
  if (!result.ok) {
    redirect(`${back}?error=${encodeURIComponent(result.code)}`);
  }
  redirect(`${back}?ok=1`);
}
