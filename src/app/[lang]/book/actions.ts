"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHold, confirmHold } from "@/lib/booking/holds";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { initiateReservationPayment } from "@/lib/payments/reservation-payments";
import { resolveTenant } from "@/lib/tenant";

// Booking-flow actions. Progressive enhancement: plain <form> posts, results
// communicated by redirect + query flags (role=alert on render). Amounts are
// never accepted from the client — pricing happens server-side throughout.

const HOLD_COOKIE = "swu_hold_session";

async function ensureHoldSession(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(HOLD_COOKIE)?.value;
  if (existing) return existing;
  const value = randomUUID();
  jar.set(HOLD_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return value;
}

async function getHoldSession(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(HOLD_COOKIE)?.value ?? null;
}

export async function holdRoomAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const roomTypeId = String(formData.get("roomTypeId") ?? "");
  const checkIn = String(formData.get("checkIn") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  const back = `/${lang}/book?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) redirect(`/${lang}`);

  const holdSession = await ensureHoldSession();
  const hold = await createHold({
    tenantId: tenant.id,
    roomTypeId,
    checkIn,
    checkOut,
    holdSession,
  });
  if (!hold.ok) {
    redirect(`${back}&error=${encodeURIComponent(hold.code)}`);
  }
  redirect(`/${lang}/book/details?claim=${hold.data.claimId}`);
}

export async function confirmBookingAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const claimId = String(formData.get("claimId") ?? "");
  const back = `/${lang}/book/details?claim=${encodeURIComponent(claimId)}`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) redirect(`/${lang}`);

  const holdSession = await getHoldSession();
  if (!holdSession) redirect(`/${lang}/book?error=HOLD_NOT_FOUND`);

  const confirmed = await confirmHold({
    tenantId: tenant.id,
    claimId,
    holdSession,
    guestName: String(formData.get("guestName") ?? ""),
    guestEmail: String(formData.get("guestEmail") ?? ""),
    guestPhone: String(formData.get("guestPhone") ?? "") || undefined,
    adults: Number(formData.get("adults") ?? 1) || 1,
    children: Number(formData.get("children") ?? 0) || 0,
    specialRequests: String(formData.get("specialRequests") ?? "") || undefined,
    promoCode: String(formData.get("promoCode") ?? "") || undefined,
    marketingOptIn: Boolean(formData.get("marketingOptIn")),
  });
  if (!confirmed.ok) {
    const target =
      confirmed.code === "HOLD_NOT_FOUND"
        ? `/${lang}/book?error=HOLD_NOT_FOUND`
        : `${back}&error=${encodeURIComponent(confirmed.code)}`;
    redirect(target);
  }

  const done = `/${lang}/book/done?code=${encodeURIComponent(confirmed.data.code)}`;

  // Request mode or nothing due now: no payment leg.
  if (confirmed.data.status === "awaiting_approval" || confirmed.data.depositMinor === 0) {
    redirect(done);
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const payment = await initiateReservationPayment({
    tenant,
    reservationId: confirmed.data.reservationId,
    callbackUrl: `${proto}://${host}${done}`,
  });
  if (!payment.ok) {
    // Reservation stands (pending payment); the done page explains next steps.
    redirect(`${done}&pay=${encodeURIComponent(payment.code)}`);
  }
  redirect(payment.data.checkoutUrl);
}

/** Pay-now retry from the confirmation page (recovery emails land here). */
export async function payNowAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const code = String(formData.get("code") ?? "");
  const done = `/${lang}/book/done?code=${encodeURIComponent(code)}`;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) redirect(`/${lang}`);

  const [reservation] = await db()
    .select({ id: reservations.id, status: reservations.status })
    .from(reservations)
    .where(and(eq(reservations.code, code), eq(reservations.tenantId, tenant.id)))
    .limit(1);
  if (!reservation || reservation.status !== "pending_payment") {
    redirect(done);
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const payment = await initiateReservationPayment({
    tenant,
    reservationId: reservation.id,
    callbackUrl: `${proto}://${host}${done}`,
  });
  if (!payment.ok) {
    redirect(`${done}&pay=${encodeURIComponent(payment.code)}`);
  }
  redirect(payment.data.checkoutUrl);
}
