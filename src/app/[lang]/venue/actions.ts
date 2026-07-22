"use server";

import { redirect } from "next/navigation";
import { resolveTenant } from "@/lib/tenant";
import { submitVenueInquiry } from "@/lib/venue";

export async function venueInquiryAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/venue`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform || !tenant.flags.events) {
    redirect(`/${lang}`);
  }

  const party = Number(formData.get("partySize"));
  const result = await submitVenueInquiry(tenant.id, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? "") || undefined,
    eventType: String(formData.get("eventType") ?? "") || undefined,
    preferredDate: String(formData.get("preferredDate") ?? "") || undefined,
    altDate: String(formData.get("altDate") ?? "") || undefined,
    partySize: Number.isInteger(party) && party > 0 ? party : undefined,
    budgetRange: String(formData.get("budgetRange") ?? "") || undefined,
    message: String(formData.get("message") ?? "") || undefined,
  });
  if (!result.ok) {
    redirect(`${back}?error=${encodeURIComponent(result.code)}`);
  }
  redirect(`${back}?ok=1`);
}
