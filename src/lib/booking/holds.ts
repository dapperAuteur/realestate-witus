// Hold lifecycle: create on search-select, confirm into a reservation, release
// on abandon, sweep expired by cron. Unit selection runs FOR UPDATE SKIP LOCKED
// inside a real transaction (withTx — the neon-http client cannot hold one);
// the unit_claims_no_overlap exclusion constraint is the backstop under any
// race this code loses.

import { and, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { db, withTx, type Tx } from "@/db";
import {
  hotelSettings,
  rateOverrides,
  reservations,
  roomTypes,
  roomUnits,
  tenants,
  unitClaims,
} from "@/db/schema";
import { parseStayRange, stayRange } from "@/db/schema/_types";
import { err, ok, type Result } from "@/lib/result";
import { generateReservationCode } from "./codes";
import { applyPromoCode, redeemPromo } from "./promos";
import { addDays, validateStay } from "./dates";
import { computeDepositMinor, resolveStayRates, type NightRate } from "./rates";

export const DEFAULT_HOLD_MINUTES = 15;

/** What is due up front for a booking mode. Shared by confirm and the quote UI. */
export function depositForMode(
  mode: "request" | "instant_full" | "instant_deposit",
  totalMinor: number,
  depositPercent: number,
): number {
  if (mode === "instant_full") return totalMinor;
  if (mode === "instant_deposit") {
    return computeDepositMinor(totalMinor, depositPercent);
  }
  return 0;
}

/** Deepest pg error code in the cause chain (neon wraps driver errors). */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateHoldInput {
  tenantId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  /** Anonymous checkout session that owns the hold (cookie value). */
  holdSession: string;
  /** Tests and admin tooling only; guests get the tenant's hotel_settings value. */
  holdMinutes?: number;
}

export interface HoldClaim {
  claimId: string;
  unitId: string;
  expiresAt: Date;
}

export async function createHold(
  input: CreateHoldInput,
): Promise<Result<HoldClaim>> {
  const { tenantId, roomTypeId, checkIn, checkOut, holdSession } = input;
  const stay = validateStay(checkIn, checkOut);
  if (!stay.ok) return stay;
  if (!holdSession) return err("INVALID_SESSION", "A hold session is required.");

  const holdMinutes = input.holdMinutes ?? (await tenantHoldMinutes(tenantId));
  const stayLit = stayRange(checkIn, checkOut);

  try {
    return await withTx(async (tx) => {
      // Expired holds still occupy the exclusion index until released_at is
      // set (the constraint's WHERE only exempts released rows), so the write
      // path physically releases stale colliders before claiming.
      await releaseExpiredHolds(tx, { tenantId, roomTypeId, stayLit });

      const picked = await tx
        .select({ id: roomUnits.id })
        .from(roomUnits)
        .where(
          and(
            eq(roomUnits.tenantId, tenantId),
            eq(roomUnits.roomTypeId, roomTypeId),
            eq(roomUnits.isActive, true),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(unitClaims)
                .where(
                  and(
                    eq(unitClaims.unitId, roomUnits.id),
                    isNull(unitClaims.releasedAt),
                    sql`${unitClaims.stay} && ${stayLit}::daterange`,
                    or(
                      ne(unitClaims.kind, "hold"),
                      sql`${unitClaims.expiresAt} > now()`,
                    ),
                  ),
                ),
            ),
          ),
        )
        .orderBy(roomUnits.unitNumber)
        .limit(1)
        .for("update", { of: roomUnits, skipLocked: true });

      const unit = picked[0];
      if (!unit) {
        return err(
          "NO_AVAILABILITY",
          "No unit of this room type is free for those dates.",
        );
      }

      const [claim] = await tx
        .insert(unitClaims)
        .values({
          tenantId,
          unitId: unit.id,
          roomTypeId,
          stay: stayLit,
          kind: "hold",
          holdSession,
          expiresAt: sql`now() + make_interval(mins => ${holdMinutes})`,
        })
        .returning({
          claimId: unitClaims.id,
          unitId: unitClaims.unitId,
          expiresAt: unitClaims.expiresAt,
        });

      return ok({
        claimId: claim.claimId,
        unitId: claim.unitId,
        expiresAt: claim.expiresAt as Date,
      });
    });
  } catch (error) {
    if (pgErrorCode(error) === EXCLUSION_VIOLATION) {
      // Lost a race the SKIP LOCKED pick could not see; same answer as "full".
      return err(
        "NO_AVAILABILITY",
        "No unit of this room type is free for those dates.",
      );
    }
    throw error;
  }
}

async function tenantHoldMinutes(tenantId: string): Promise<number> {
  const [settings] = await db()
    .select({ holdMinutes: hotelSettings.holdMinutes })
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, tenantId))
    .limit(1);
  return settings?.holdMinutes ?? DEFAULT_HOLD_MINUTES;
}

async function releaseExpiredHolds(
  tx: Tx,
  args: { tenantId: string; roomTypeId: string; stayLit: string },
): Promise<void> {
  await tx
    .update(unitClaims)
    .set({ releasedAt: sql`now()` })
    .where(
      and(
        eq(unitClaims.tenantId, args.tenantId),
        eq(unitClaims.roomTypeId, args.roomTypeId),
        eq(unitClaims.kind, "hold"),
        isNull(unitClaims.releasedAt),
        sql`${unitClaims.expiresAt} <= now()`,
        sql`${unitClaims.stay} && ${args.stayLit}::daterange`,
      ),
    );
}

// ── Release ───────────────────────────────────────────────────────────────────

export interface ReleaseHoldInput {
  tenantId: string;
  claimId: string;
  /** Must match the session that created the hold — nobody frees another guest's hold. */
  holdSession: string;
}

export async function releaseHold(
  input: ReleaseHoldInput,
): Promise<Result<{ released: boolean }>> {
  const rows = await db()
    .update(unitClaims)
    .set({ releasedAt: sql`now()` })
    .where(
      and(
        eq(unitClaims.id, input.claimId),
        eq(unitClaims.tenantId, input.tenantId),
        eq(unitClaims.kind, "hold"),
        eq(unitClaims.holdSession, input.holdSession),
        isNull(unitClaims.releasedAt),
      ),
    )
    .returning({ id: unitClaims.id });
  return ok({ released: rows.length > 0 });
}

// ── Confirm ───────────────────────────────────────────────────────────────────

export interface ConfirmHoldInput {
  tenantId: string;
  claimId: string;
  holdSession: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestCountry?: string;
  adults?: number;
  children?: number;
  specialRequests?: string;
  /** Optional promo code; invalid codes fail the confirm with PROMO_INVALID. */
  promoCode?: string;
  /** Marketing consent checkbox — never defaulted on. */
  marketingOptIn?: boolean;
}

export interface ConfirmedReservation {
  reservationId: string;
  code: string;
  status: "pending_payment" | "awaiting_approval";
  checkIn: string;
  checkOut: string;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  discountMinor: number;
  rateBreakdown: NightRate[];
}

/**
 * Turns a live hold into a reservation: prices the stay server-side (never
 * trusting a client total), snapshots policy + mode, and flips the claim to
 * kind='booking' so it stops expiring. Retried wholesale on the rare
 * reservation-code collision.
 */
export async function confirmHold(
  input: ConfirmHoldInput,
): Promise<Result<ConfirmedReservation>> {
  if (!input.guestName.trim() || !input.guestEmail.trim()) {
    return err("INVALID_GUEST", "Guest name and email are required.");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await confirmHoldOnce(input);
    } catch (error) {
      if (pgErrorCode(error) === UNIQUE_VIOLATION && attempt < 2) continue;
      throw error;
    }
  }
  return err("CODE_COLLISION", "Could not allocate a reservation code.");
}

async function confirmHoldOnce(
  input: ConfirmHoldInput,
): Promise<Result<ConfirmedReservation>> {
  return withTx(async (tx) => {
    const [claim] = await tx
      .select()
      .from(unitClaims)
      .where(
        and(
          eq(unitClaims.id, input.claimId),
          eq(unitClaims.tenantId, input.tenantId),
          eq(unitClaims.kind, "hold"),
          eq(unitClaims.holdSession, input.holdSession),
          isNull(unitClaims.releasedAt),
          sql`${unitClaims.expiresAt} > now()`,
        ),
      )
      .for("update")
      .limit(1);
    if (!claim) {
      return err(
        "HOLD_NOT_FOUND",
        "This hold has expired or does not exist. Please search again.",
      );
    }

    const parsed = parseStayRange(claim.stay);
    if (!parsed) {
      return err("INVALID_CLAIM", "Stored stay range is malformed.");
    }
    const { checkIn, checkOut } = parsed;

    const [roomType] = await tx
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.id, claim.roomTypeId))
      .limit(1);
    if (!roomType) {
      return err("ROOM_TYPE_NOT_FOUND", "Room type no longer exists.");
    }

    const [tenant] = await tx
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .limit(1);
    if (!tenant) {
      return err("TENANT_NOT_FOUND", "Tenant no longer exists.");
    }

    const [settings] = await tx
      .select()
      .from(hotelSettings)
      .where(eq(hotelSettings.tenantId, input.tenantId))
      .limit(1);
    const bookingMode = settings?.bookingMode ?? "instant_deposit";
    const depositPercent = settings?.depositPercent ?? 30;

    const overrides = await tx
      .select()
      .from(rateOverrides)
      .where(
        and(
          eq(rateOverrides.tenantId, input.tenantId),
          eq(rateOverrides.roomTypeId, claim.roomTypeId),
          sql`${rateOverrides.startDate} <= ${addDays(checkOut, -1)}`,
          sql`${rateOverrides.endDate} >= ${checkIn}`,
        ),
      );

    const rates = resolveStayRates(
      checkIn,
      checkOut,
      roomType.baseRateMinor,
      overrides,
    );

    let discountMinor = 0;
    let appliedPromoId: string | null = null;
    let appliedPromoCode: string | null = null;
    if (input.promoCode?.trim()) {
      const promo = await applyPromoCode({
        tenantId: input.tenantId,
        code: input.promoCode,
        roomTypeId: claim.roomTypeId,
        checkIn,
        totalMinor: rates.totalMinor,
      });
      if (!promo.ok) return promo;
      discountMinor = promo.data.discountMinor;
      appliedPromoId = promo.data.promoId;
      appliedPromoCode = promo.data.code;
    }
    const totalMinor = rates.totalMinor - discountMinor;
    // Deposit percent applies to what the guest actually owes.
    const depositMinor = depositForMode(bookingMode, totalMinor, depositPercent);
    const status =
      bookingMode === "request" ? "awaiting_approval" : "pending_payment";
    if (appliedPromoId) {
      // FIRST tx write, before the reservation insert: Result-return does
      // not roll back, so nothing else may be written until this succeeds.
      const redeemed = await redeemPromo(tx, appliedPromoId);
      if (!redeemed) {
        return err("PROMO_INVALID", "That code is not valid for this stay.");
      }
    }

    const code = generateReservationCode(
      tenant.slug,
      new Date().getUTCFullYear(),
    );

    const [reservation] = await tx
      .insert(reservations)
      .values({
        tenantId: input.tenantId,
        code,
        roomTypeId: claim.roomTypeId,
        guestName: input.guestName.trim(),
        guestEmail: input.guestEmail.trim(),
        guestPhone: input.guestPhone,
        guestCountry: input.guestCountry,
        checkIn,
        checkOut,
        adults: input.adults ?? 1,
        children: input.children ?? 0,
        status,
        bookingMode,
        totalMinor,
        depositMinor,
        currency: roomType.currency,
        rateBreakdown: rates.nights,
        cancellationPolicySnapshot: settings?.cancellationPolicy ?? undefined,
        specialRequests: input.specialRequests,
        // Undefined omits the column: keeps inserts valid until migration
        // 0002 lands; values only flow once the features are used.
        promoCode: appliedPromoCode ?? undefined,
        discountMinor: discountMinor > 0 ? discountMinor : undefined,
        marketingOptIn: input.marketingOptIn ? true : undefined,
        marketingOptInAt: input.marketingOptIn ? new Date() : undefined,
      })
      .returning({ id: reservations.id });

    await tx
      .update(unitClaims)
      .set({
        kind: "booking",
        reservationId: reservation.id,
        expiresAt: null,
      })
      .where(eq(unitClaims.id, claim.id));

    return ok({
      reservationId: reservation.id,
      code,
      status,
      checkIn,
      checkOut,
      currency: roomType.currency,
      totalMinor,
      depositMinor,
      discountMinor,
      rateBreakdown: rates.nights,
    });
  });
}

// ── Sweep ─────────────────────────────────────────────────────────────────────

/**
 * Cross-tenant by design: this is platform maintenance run from the cron
 * route, not a tenant-facing query. Correctness never depends on it — reads
 * filter expired holds lazily and writes release colliders — the sweep just
 * keeps the claims table tidy.
 */
export async function sweepExpiredHolds(): Promise<Result<{ released: number }>> {
  const rows = await db()
    .update(unitClaims)
    .set({ releasedAt: sql`now()` })
    .where(
      and(
        eq(unitClaims.kind, "hold"),
        isNull(unitClaims.releasedAt),
        sql`${unitClaims.expiresAt} <= now()`,
      ),
    )
    .returning({ id: unitClaims.id });
  return ok({ released: rows.length });
}
