import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, withTx } from "@/db";
import { reservations, roomTypes, unitClaims } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

// Reservation lifecycle from the desk. Cancel/no-show release the unit claim
// in the same transaction — the room frees the moment the status flips.

export const RESERVATION_STATUSES = [
  "pending_payment",
  "awaiting_approval",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
  "expired",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export type ReservationAction =
  | "approve"
  | "check_in"
  | "check_out"
  | "cancel"
  | "no_show";

/** action → the statuses it may leave from, and where it lands. */
const TRANSITIONS: Record<
  ReservationAction,
  { from: ReservationStatus[]; to: ReservationStatus; releasesClaim: boolean }
> = {
  approve: { from: ["awaiting_approval"], to: "confirmed", releasesClaim: false },
  check_in: {
    from: ["confirmed", "pending_payment"],
    to: "checked_in",
    releasesClaim: false,
  },
  check_out: { from: ["checked_in"], to: "checked_out", releasesClaim: false },
  cancel: {
    from: ["pending_payment", "awaiting_approval", "confirmed"],
    to: "cancelled",
    releasesClaim: true,
  },
  no_show: { from: ["confirmed", "pending_payment"], to: "no_show", releasesClaim: true },
};

export interface ReservationRow {
  id: string;
  code: string;
  guestName: string;
  guestEmail: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  paymentStatus: string;
  totalMinor: number;
  depositMinor: number;
  currency: string;
  createdAt: Date;
}

export async function listReservations(
  tenantId: string,
  opts: { status?: ReservationStatus; limit?: number } = {},
): Promise<Result<ReservationRow[]>> {
  const conditions = [eq(reservations.tenantId, tenantId)];
  if (opts.status) conditions.push(eq(reservations.status, opts.status));
  const rows = await db()
    .select({
      id: reservations.id,
      code: reservations.code,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      roomTypeName: roomTypes.name,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      status: reservations.status,
      paymentStatus: reservations.paymentStatus,
      totalMinor: reservations.totalMinor,
      depositMinor: reservations.depositMinor,
      currency: reservations.currency,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .innerJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
    .where(and(...conditions))
    .orderBy(desc(reservations.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
  return ok(rows);
}

/**
 * Applies a desk action. Row-locked so two clerks acting at once cannot
 * double-transition; releasing the claim rides the same transaction.
 */
export async function transitionReservation(
  tenantId: string,
  reservationId: string,
  action: ReservationAction,
): Promise<Result<{ status: ReservationStatus }>> {
  const t = TRANSITIONS[action];
  if (!t) return err("UNKNOWN_ACTION", "Unknown reservation action.");

  return withTx(async (tx) => {
    const [row] = await tx
      .select({ id: reservations.id, status: reservations.status })
      .from(reservations)
      .where(
        and(eq(reservations.id, reservationId), eq(reservations.tenantId, tenantId)),
      )
      .for("update")
      .limit(1);
    if (!row) return err("RESERVATION_NOT_FOUND", "Reservation not found.");
    if (!t.from.includes(row.status)) {
      return err(
        "INVALID_TRANSITION",
        `Cannot ${action.replace("_", " ")} a ${row.status.replace("_", " ")} reservation.`,
      );
    }

    await tx
      .update(reservations)
      .set({ status: t.to, updatedAt: new Date() })
      .where(eq(reservations.id, row.id));

    if (t.releasesClaim) {
      await tx
        .update(unitClaims)
        .set({ releasedAt: sql`now()` })
        .where(
          and(
            eq(unitClaims.reservationId, row.id),
            eq(unitClaims.tenantId, tenantId),
            isNull(unitClaims.releasedAt),
          ),
        );
    }

    return ok({ status: t.to });
  });
}
