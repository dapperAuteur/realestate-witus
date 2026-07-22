import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { rateOverrides, roomTypes } from "@/db/schema";
import {
  addDays,
  isIsoDate,
  isIsoMonth,
  monthDays,
  monthStart,
  nextMonthStart,
} from "@/lib/booking/dates";
import { resolveNightRate, type NightRate } from "@/lib/booking/rates";
import { err, ok, type Result } from "@/lib/result";

// Pricing calendar: what each night of a month actually costs (base +
// winning override), plus CRUD for rate_overrides. Same resolveNightRate the
// guest quote uses — the admin preview can never disagree with checkout.

export interface PricingMonth {
  roomType: { id: string; name: string; baseRateMinor: number; currency: string };
  days: NightRate[];
  overrides: (typeof rateOverrides.$inferSelect)[];
}

export async function getPricingMonth(
  tenantId: string,
  roomTypeId: string,
  month: string,
): Promise<Result<PricingMonth>> {
  if (!isIsoMonth(month)) return err("INVALID_MONTH", "Month must be YYYY-MM.");
  const [roomType] = await db()
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.tenantId, tenantId)))
    .limit(1);
  if (!roomType) return err("ROOM_TYPE_NOT_FOUND", "Room type not found.");

  const overlapping = await db()
    .select()
    .from(rateOverrides)
    .where(
      and(
        eq(rateOverrides.tenantId, tenantId),
        eq(rateOverrides.roomTypeId, roomTypeId),
        lte(rateOverrides.startDate, addDays(nextMonthStart(month), -1)),
        gte(rateOverrides.endDate, monthStart(month)),
      ),
    )
    .orderBy(desc(rateOverrides.priority), desc(rateOverrides.createdAt));

  return ok({
    roomType: {
      id: roomType.id,
      name: roomType.name,
      baseRateMinor: roomType.baseRateMinor,
      currency: roomType.currency,
    },
    days: monthDays(month).map((date) =>
      resolveNightRate(date, roomType.baseRateMinor, overlapping),
    ),
    overrides: overlapping,
  });
}

export async function listRoomTypes(tenantId: string) {
  return db()
    .select({ id: roomTypes.id, name: roomTypes.name })
    .from(roomTypes)
    .where(and(eq(roomTypes.tenantId, tenantId), eq(roomTypes.isActive, true)))
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name));
}

export interface CreateOverrideInput {
  tenantId: string;
  roomTypeId: string;
  label: string;
  startDate: string;
  endDate: string;
  rateMinor: number;
  /** Mon=1<<0 .. Sun=1<<6; null/0 → every day. */
  dowMask: number | null;
  priority: number;
  kind?: "seasonal" | "weekend" | "event" | "custom";
}

export async function createRateOverride(
  input: CreateOverrideInput,
): Promise<Result<{ id: string }>> {
  const label = input.label.trim();
  if (!label) return err("INVALID_LABEL", "Give the override a name.");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) {
    return err("INVALID_DATE", "Dates must be valid YYYY-MM-DD.");
  }
  if (input.endDate < input.startDate) {
    return err("INVALID_RANGE", "End date must not be before start date.");
  }
  if (!Number.isInteger(input.rateMinor) || input.rateMinor <= 0) {
    return err("INVALID_RATE", "Rate must be a positive amount.");
  }
  const dowMask =
    input.dowMask == null || input.dowMask === 0 ? null : input.dowMask;
  if (dowMask !== null && (dowMask < 1 || dowMask > 127)) {
    return err("INVALID_DOW", "Day-of-week selection is invalid.");
  }

  const [roomType] = await db()
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(eq(roomTypes.id, input.roomTypeId), eq(roomTypes.tenantId, input.tenantId)),
    )
    .limit(1);
  if (!roomType) return err("ROOM_TYPE_NOT_FOUND", "Room type not found.");

  const [row] = await db()
    .insert(rateOverrides)
    .values({
      tenantId: input.tenantId,
      roomTypeId: input.roomTypeId,
      label,
      kind: input.kind ?? "custom",
      startDate: input.startDate,
      endDate: input.endDate,
      rateMinor: input.rateMinor,
      dowMask,
      priority: Number.isInteger(input.priority) ? input.priority : 0,
    })
    .returning({ id: rateOverrides.id });
  return ok({ id: row.id });
}

export async function deleteRateOverride(
  tenantId: string,
  overrideId: string,
): Promise<Result<{ deleted: boolean }>> {
  const rows = await db()
    .delete(rateOverrides)
    .where(
      and(eq(rateOverrides.id, overrideId), eq(rateOverrides.tenantId, tenantId)),
    )
    .returning({ id: rateOverrides.id });
  return ok({ deleted: rows.length > 0 });
}
