// Read-path availability. Expired holds are filtered lazily here (no writes on
// the search path); they are physically released on the write path (holds.ts)
// because an unswept hold still occupies the unit_claims_no_overlap index.

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateOverrides } from "@/db/schema";
import { stayRange } from "@/db/schema/_types";
import { err, ok, type Result } from "@/lib/result";
import { addDays, validateStay } from "./dates";
import {
  resolveStayRates,
  type RateOverrideInput,
  type StayRates,
} from "./rates";

export interface RoomTypeAvailability {
  roomTypeId: string;
  slug: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  currency: string;
  baseRateMinor: number;
  freeUnits: number;
  rates: StayRates;
}

export interface AvailabilityQuery {
  tenantId: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Every active room type for the tenant with how many of its active units are
 * free for the whole stay, plus the resolved nightly pricing. freeUnits 0 rows
 * are included so the UI can show "sold out for these dates".
 */
export async function getAvailability(
  query: AvailabilityQuery,
): Promise<Result<RoomTypeAvailability[]>> {
  const { tenantId, checkIn, checkOut } = query;
  const stay = validateStay(checkIn, checkOut);
  if (!stay.ok) return stay;

  const stayLit = stayRange(checkIn, checkOut);
  const typeRows = await db().execute<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    max_occupancy: number;
    currency: string;
    base_rate_minor: number;
    free_units: number;
  }>(sql`
    select
      rt.id,
      rt.slug,
      rt.name,
      rt.description,
      rt.max_occupancy,
      rt.currency,
      rt.base_rate_minor,
      count(u.id)::int as free_units
    from room_types rt
    left join room_units u
      on u.room_type_id = rt.id
      and u.is_active
      -- A live claim blocks the unit: not released, overlapping, and either a
      -- booking/blockout or an unexpired hold. Keep in sync with the unit
      -- pick in holds.ts.
      and not exists (
        select 1 from unit_claims c
        where c.unit_id = u.id
          and c.released_at is null
          and c.stay && ${stayLit}::daterange
          and (c.kind <> 'hold' or c.expires_at > now())
      )
    where rt.tenant_id = ${tenantId} and rt.is_active
    group by rt.id
    order by rt.sort_order, rt.name
  `);

  const types = typeRows.rows;
  if (types.length === 0) return ok([]);

  // One override fetch for all room types; resolution happens in JS so the
  // same code path prices the search results and the reservation snapshot.
  const lastNight = addDays(checkOut, -1);
  const overrideRows = await db()
    .select()
    .from(rateOverrides)
    .where(
      and(
        eq(rateOverrides.tenantId, tenantId),
        inArray(
          rateOverrides.roomTypeId,
          types.map((t) => t.id),
        ),
        lte(rateOverrides.startDate, lastNight),
        gte(rateOverrides.endDate, checkIn),
      ),
    );

  const byType = new Map<string, RateOverrideInput[]>();
  for (const row of overrideRows) {
    const list = byType.get(row.roomTypeId) ?? [];
    list.push(row);
    byType.set(row.roomTypeId, list);
  }

  return ok(
    types.map((t) => ({
      roomTypeId: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      maxOccupancy: t.max_occupancy,
      currency: t.currency,
      baseRateMinor: t.base_rate_minor,
      freeUnits: t.free_units,
      rates: resolveStayRates(
        checkIn,
        checkOut,
        t.base_rate_minor,
        byType.get(t.id) ?? [],
      ),
    })),
  );
}
