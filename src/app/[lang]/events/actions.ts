"use server";

import { redirect } from "next/navigation";
import { submitRsvp } from "@/lib/events";
import { resolveTenant } from "@/lib/tenant";

export async function rsvpAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const eventId = String(formData.get("eventId") ?? "");
  const back = `/${lang}/events?event=${encodeURIComponent(eventId)}`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform || !tenant.flags.events) {
    redirect(`/${lang}`);
  }

  const result = await submitRsvp(tenant.id, eventId, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? "") || undefined,
    partySize: Number(formData.get("partySize") ?? 1) || 1,
  });
  if (!result.ok) {
    redirect(`${back}&error=${encodeURIComponent(result.code)}`);
  }
  redirect(`${back}&ok=1`);
}
