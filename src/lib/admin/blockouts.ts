import { and, asc, eq, inArray, isNull, or, ne, sql } from "drizzle-orm";
import { db, withTx } from "@/db";
import { reservations, roomTypes, roomUnits, unitClaims } from "@/db/schema";
import { parseStayRange, stayRange } from "@/db/schema/_types";
import { isIsoMonth, monthStart, nextMonthStart } from "@/lib/booking/dates";
import { pgErrorCode } from "@/lib/booking/holds";
import { err, ok, type Result } from "@/lib/result";

// Blockouts: owner/desk takes a unit out of sale (maintenance, owner use,
// external OTA booking). Same unit_claims table, kind='blockout', no expiry —
// the exclusion constraint arbitrates against guest bookings automatically.

export interface CreateBlockoutInput {
  tenantId: string;
  unitId: string;
  /** Half-open [startDate, endDate); a single day is [d, d+1). */
  startDate: string;
  endDate: string;
  reason?: string;
  createdBy?: string;
}

export async function createBlockout(
  input: CreateBlockoutInput,
): Promise<Result<{ claimId: string }>> {
  const stayLit = stayRange(input.startDate, input.endDate);
  try {
    return await withTx(async (tx) => {
      const [unit] = await tx
        .select({ id: roomUnits.id, roomTypeId: roomUnits.roomTypeId })
        .from(roomUnits)
        .where(
          and(eq(roomUnits.id, input.unitId), eq(roomUnits.tenantId, input.tenantId)),
        )
        .limit(1);
      if (!unit) return err("UNIT_NOT_FOUND", "Unit not found.");

      // Expired-but-unswept holds still occupy the exclusion index.
      await tx
        .update(unitClaims)
        .set({ releasedAt: sql`now()` })
        .where(
          and(
            eq(unitClaims.unitId, unit.id),
            eq(unitClaims.kind, "hold"),
            isNull(unitClaims.releasedAt),
            sql`${unitClaims.expiresAt} <= now()`,
            sql`${unitClaims.stay} && ${stayLit}::daterange`,
          ),
        );

      const [claim] = await tx
        .insert(unitClaims)
        .values({
          tenantId: input.tenantId,
          unitId: unit.id,
          roomTypeId: unit.roomTypeId,
          stay: stayLit,
          kind: "blockout",
          reason: input.reason?.trim() || null,
          createdBy: input.createdBy,
        })
        .returning({ id: unitClaims.id });
      return ok({ claimId: claim.id });
    });
  } catch (error) {
    if (pgErrorCode(error) === "23P01") {
      return err("OCCUPIED", "A booking or blockout already covers those dates.");
    }
    throw error;
  }
}

/** Only blockouts release this way; bookings free their unit via cancel/no-show. */
export async function releaseBlockout(
  tenantId: string,
  claimId: string,
): Promise<Result<{ released: boolean }>> {
  const rows = await db()
    .update(unitClaims)
    .set({ releasedAt: sql`now()` })
    .where(
      and(
        eq(unitClaims.id, claimId),
        eq(unitClaims.tenantId, tenantId),
        eq(unitClaims.kind, "blockout"),
        isNull(unitClaims.releasedAt),
      ),
    )
    .returning({ id: unitClaims.id });
  return ok({ released: rows.length > 0 });
}

export interface UnitCalendarClaim {
  claimId: string;
  kind: "hold" | "booking" | "blockout";
  checkIn: string;
  checkOut: string;
  reason: string | null;
  reservationCode: string | null;
  guestName: string | null;
}

export interface UnitCalendarRow {
  unitId: string;
  unitNumber: string;
  roomTypeName: string;
  claims: UnitCalendarClaim[];
}

/** Everything live touching a month, grouped per unit, for the grid. */
export async function getUnitMonth(
  tenantId: string,
  month: string,
): Promise<Result<UnitCalendarRow[]>> {
  if (!isIsoMonth(month)) return err("INVALID_MONTH", "Month must be YYYY-MM.");
  const monthLit = stayRange(monthStart(month), nextMonthStart(month));

  const units = await db()
    .select({
      unitId: roomUnits.id,
      unitNumber: roomUnits.unitNumber,
      roomTypeName: roomTypes.name,
    })
    .from(roomUnits)
    .innerJoin(roomTypes, eq(roomUnits.roomTypeId, roomTypes.id))
    .where(and(eq(roomUnits.tenantId, tenantId), eq(roomUnits.isActive, true)))
    .orderBy(asc(roomTypes.sortOrder), asc(roomUnits.unitNumber));
  if (units.length === 0) return ok([]);

  const claims = await db()
    .select({
      claimId: unitClaims.id,
      unitId: unitClaims.unitId,
      kind: unitClaims.kind,
      stay: unitClaims.stay,
      reason: unitClaims.reason,
      reservationCode: reservations.code,
      guestName: reservations.guestName,
    })
    .from(unitClaims)
    .leftJoin(reservations, eq(unitClaims.reservationId, reservations.id))
    .where(
      and(
        eq(unitClaims.tenantId, tenantId),
        inArray(
          unitClaims.unitId,
          units.map((u) => u.unitId),
        ),
        isNull(unitClaims.releasedAt),
        sql`${unitClaims.stay} && ${monthLit}::daterange`,
        or(ne(unitClaims.kind, "hold"), sql`${unitClaims.expiresAt} > now()`),
      ),
    );

  const byUnit = new Map<string, UnitCalendarClaim[]>();
  for (const c of claims) {
    const range = parseStayRange(c.stay);
    if (!range) continue;
    const list = byUnit.get(c.unitId) ?? [];
    list.push({
      claimId: c.claimId,
      kind: c.kind,
      checkIn: range.checkIn,
      checkOut: range.checkOut,
      reason: c.reason,
      reservationCode: c.reservationCode,
      guestName: c.guestName,
    });
    byUnit.set(c.unitId, list);
  }

  return ok(
    units.map((u) => ({
      unitId: u.unitId,
      unitNumber: u.unitNumber,
      roomTypeName: u.roomTypeName,
      claims: byUnit.get(u.unitId) ?? [],
    })),
  );
}
