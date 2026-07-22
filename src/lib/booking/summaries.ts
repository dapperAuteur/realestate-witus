import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  hotelSettings,
  rateOverrides,
  reservations,
  roomTypes,
  unitClaims,
} from "@/db/schema";
import { parseStayRange } from "@/db/schema/_types";
import { err, ok, type Result } from "@/lib/result";
import { addDays, nightsBetween } from "./dates";
import { depositForMode } from "./holds";
import { resolveStayRates, type NightRate } from "./rates";

// Read models for the public booking flow. Everything is tenant-guarded and,
// for holds, session-guarded — a claim id alone never reveals anything.

export interface HoldSummary {
  claimId: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  nights: NightRate[];
  totalMinor: number;
  dueNowMinor: number;
  currency: string;
  bookingMode: "request" | "instant_full" | "instant_deposit";
  cancellationPolicy: { freeUntilDays?: number; penaltyPercent?: number } | null;
  expiresAt: Date;
}

export async function getHoldSummary(args: {
  tenantId: string;
  claimId: string;
  holdSession: string;
}): Promise<Result<HoldSummary>> {
  const [claim] = await db()
    .select()
    .from(unitClaims)
    .where(
      and(
        eq(unitClaims.id, args.claimId),
        eq(unitClaims.tenantId, args.tenantId),
        eq(unitClaims.kind, "hold"),
        eq(unitClaims.holdSession, args.holdSession),
        isNull(unitClaims.releasedAt),
        sql`${unitClaims.expiresAt} > now()`,
      ),
    )
    .limit(1);
  if (!claim || !claim.expiresAt) {
    return err("HOLD_NOT_FOUND", "This hold has expired. Please search again.");
  }
  const stay = parseStayRange(claim.stay);
  if (!stay) return err("INVALID_CLAIM", "Stored stay range is malformed.");

  const [roomType] = await db()
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, claim.roomTypeId))
    .limit(1);
  if (!roomType) return err("ROOM_TYPE_NOT_FOUND", "Room type no longer exists.");

  const [settings] = await db()
    .select()
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, args.tenantId))
    .limit(1);
  const bookingMode = settings?.bookingMode ?? "instant_deposit";
  const depositPercent = settings?.depositPercent ?? 30;

  const overrides = await db()
    .select()
    .from(rateOverrides)
    .where(
      and(
        eq(rateOverrides.tenantId, args.tenantId),
        eq(rateOverrides.roomTypeId, claim.roomTypeId),
        sql`${rateOverrides.startDate} <= ${addDays(stay.checkOut, -1)}`,
        sql`${rateOverrides.endDate} >= ${stay.checkIn}`,
      ),
    );
  const rates = resolveStayRates(
    stay.checkIn,
    stay.checkOut,
    roomType.baseRateMinor,
    overrides,
  );

  return ok({
    claimId: claim.id,
    roomTypeName: roomType.name,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nightsCount: nightsBetween(stay.checkIn, stay.checkOut),
    nights: rates.nights,
    totalMinor: rates.totalMinor,
    dueNowMinor: depositForMode(bookingMode, rates.totalMinor, depositPercent),
    currency: roomType.currency,
    bookingMode,
    cancellationPolicy: settings?.cancellationPolicy ?? null,
    expiresAt: claim.expiresAt,
  });
}

export interface ReservationSummary {
  code: string;
  status: string;
  paymentStatus: string;
  roomTypeName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  totalMinor: number;
  depositMinor: number;
  discountMinor: number;
  promoCode: string | null;
  currency: string;
  cancellationPolicySnapshot: { freeUntilDays?: number; penaltyPercent?: number } | null;
}

/** The code is the guest's lookup key by design (spoken over the phone). */
export async function getReservationSummaryByCode(args: {
  tenantId: string;
  code: string;
}): Promise<Result<ReservationSummary>> {
  const [row] = await db()
    .select({
      code: reservations.code,
      status: reservations.status,
      paymentStatus: reservations.paymentStatus,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      totalMinor: reservations.totalMinor,
      depositMinor: reservations.depositMinor,
      discountMinor: reservations.discountMinor,
      promoCode: reservations.promoCode,
      currency: reservations.currency,
      cancellationPolicySnapshot: reservations.cancellationPolicySnapshot,
      roomTypeName: roomTypes.name,
    })
    .from(reservations)
    .innerJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
    .where(
      and(
        eq(reservations.tenantId, args.tenantId),
        eq(reservations.code, args.code),
      ),
    )
    .limit(1);
  if (!row) {
    return err("RESERVATION_NOT_FOUND", "No reservation matches this code.");
  }
  return ok(row);
}
