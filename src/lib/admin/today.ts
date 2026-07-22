import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reservations, roomTypes } from "@/db/schema";
import { ok, type Result } from "@/lib/result";

// The front-desk morning view: who arrives, who leaves, who is in-house,
// what needs attention. "Today" is the hotel's local date — callers pass it
// (hotel_settings.timezone decides), this module stays timezone-free.

export interface TodayReservation {
  id: string;
  code: string;
  guestName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  paymentStatus: string;
}

export interface TodayBoard {
  arrivals: TodayReservation[];
  departures: TodayReservation[];
  inHouseCount: number;
  awaitingApprovalCount: number;
  pendingPaymentCount: number;
}

const summarySelect = {
  id: reservations.id,
  code: reservations.code,
  guestName: reservations.guestName,
  roomTypeName: roomTypes.name,
  checkIn: reservations.checkIn,
  checkOut: reservations.checkOut,
  status: reservations.status,
  paymentStatus: reservations.paymentStatus,
};

export async function getTodayBoard(
  tenantId: string,
  today: string,
): Promise<Result<TodayBoard>> {
  const [arrivals, departures, [inHouse], [awaiting], [pending]] =
    await Promise.all([
      db()
        .select(summarySelect)
        .from(reservations)
        .innerJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
        .where(
          and(
            eq(reservations.tenantId, tenantId),
            eq(reservations.checkIn, today),
            inArray(reservations.status, ["confirmed", "pending_payment"]),
          ),
        )
        .orderBy(asc(reservations.guestName)),
      db()
        .select(summarySelect)
        .from(reservations)
        .innerJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
        .where(
          and(
            eq(reservations.tenantId, tenantId),
            eq(reservations.checkOut, today),
            eq(reservations.status, "checked_in"),
          ),
        )
        .orderBy(asc(reservations.guestName)),
      db()
        .select({ n: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, tenantId),
            eq(reservations.status, "checked_in"),
          ),
        ),
      db()
        .select({ n: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, tenantId),
            eq(reservations.status, "awaiting_approval"),
          ),
        ),
      db()
        .select({ n: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, tenantId),
            eq(reservations.status, "pending_payment"),
          ),
        ),
    ]);

  return ok({
    arrivals,
    departures,
    inHouseCount: inHouse.n,
    awaitingApprovalCount: awaiting.n,
    pendingPaymentCount: pending.n,
  });
}

/** Today's date in the hotel's own timezone (hotel_settings, default Accra). */
export function localToday(timezone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}
