import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelSettings } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

// Operational settings the owner manages (/admin/settings) — including the
// cancellation policy, which confirmHold snapshots onto every reservation
// and the booking pages display (research action A1).

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Curated timezone list; grows with new markets. */
export const TIMEZONES = [
  "Africa/Accra",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "America/New_York",
] as const;

export interface HotelSettingsInput {
  hotelName: string;
  address: string;
  phone: string;
  whatsappE164: string;
  whatsappGroupUrl: string;
  email: string;
  checkinTime: string;
  checkoutTime: string;
  timezone: string;
  bookingMode: "request" | "instant_full" | "instant_deposit";
  depositPercent: number;
  holdMinutes: number;
  cancellationFreeUntilDays: number | null;
  cancellationPenaltyPercent: number | null;
}

export async function getHotelSettings(tenantId: string) {
  const [row] = await db()
    .select()
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

export async function upsertHotelSettings(
  tenantId: string,
  input: HotelSettingsInput,
): Promise<Result<{ saved: boolean }>> {
  if (!input.hotelName.trim()) {
    return err("INVALID_NAME", "The hotel needs a name.");
  }
  if (!TIME_RE.test(input.checkinTime) || !TIME_RE.test(input.checkoutTime)) {
    return err("INVALID_TIME", "Times must be HH:MM, like 14:00.");
  }
  if (!(TIMEZONES as readonly string[]).includes(input.timezone)) {
    return err("INVALID_TIMEZONE", "Pick a timezone from the list.");
  }
  if (
    !Number.isInteger(input.depositPercent) ||
    input.depositPercent < 0 ||
    input.depositPercent > 100
  ) {
    return err("INVALID_DEPOSIT", "Deposit must be 0-100 percent.");
  }
  if (
    !Number.isInteger(input.holdMinutes) ||
    input.holdMinutes < 5 ||
    input.holdMinutes > 120
  ) {
    return err("INVALID_HOLD", "Holds must be between 5 and 120 minutes.");
  }
  const whatsapp = input.whatsappE164.trim();
  if (whatsapp && !/^\+[1-9]\d{7,14}$/.test(whatsapp)) {
    return err("INVALID_WHATSAPP", "WhatsApp number needs international format.");
  }
  const groupUrl = input.whatsappGroupUrl.trim();
  if (groupUrl && !/^https:\/\/\S+$/.test(groupUrl)) {
    return err("INVALID_URL", "Links must start with https://");
  }
  const freeDays = input.cancellationFreeUntilDays;
  const penalty = input.cancellationPenaltyPercent;
  if (freeDays !== null && (!Number.isInteger(freeDays) || freeDays < 0 || freeDays > 60)) {
    return err("INVALID_POLICY", "Free-cancellation days must be 0-60.");
  }
  if (penalty !== null && (!Number.isInteger(penalty) || penalty < 0 || penalty > 100)) {
    return err("INVALID_POLICY", "Penalty must be 0-100 percent.");
  }

  const cancellationPolicy =
    freeDays === null && penalty === null
      ? null
      : {
          ...(freeDays !== null ? { freeUntilDays: freeDays } : {}),
          ...(penalty !== null ? { penaltyPercent: penalty } : {}),
        };

  const values = {
    hotelName: input.hotelName.trim(),
    address: input.address.trim() || null,
    phone: input.phone.trim() || null,
    whatsappE164: whatsapp || null,
    whatsappGroupUrl: groupUrl || null,
    email: input.email.trim() || null,
    checkinTime: input.checkinTime,
    checkoutTime: input.checkoutTime,
    timezone: input.timezone,
    bookingMode: input.bookingMode,
    depositPercent: input.depositPercent,
    holdMinutes: input.holdMinutes,
    cancellationPolicy,
    updatedAt: new Date(),
  };
  await db()
    .insert(hotelSettings)
    .values({ tenantId, ...values })
    .onConflictDoUpdate({ target: hotelSettings.tenantId, set: values });
  return ok({ saved: true });
}
