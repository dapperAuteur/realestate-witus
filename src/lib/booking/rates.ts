// Pure rate resolution: nightly price = the matching rate_override with the
// highest priority, else the room type's base rate. All money in minor units
// (GHS pesewas). DB rows are passed in so this stays testable without a DB.

import { dowMaskIncludes, eachNight } from "./dates";

export interface RateOverrideInput {
  id: string;
  label: string;
  /** Inclusive on both ends: a Dec 1–31 season prices every December night. */
  startDate: string;
  endDate: string;
  dowMask: number | null;
  rateMinor: number;
  priority: number;
  createdAt?: Date | string | null;
}

/** Matches reservations.rate_breakdown's stored shape. */
export interface NightRate {
  date: string;
  rateMinor: number;
  overrideLabel?: string;
}

export interface StayRates {
  nights: NightRate[];
  totalMinor: number;
}

function createdAtMs(o: RateOverrideInput): number {
  if (!o.createdAt) return 0;
  return new Date(o.createdAt).getTime();
}

/**
 * Ties on priority go to the most recently created override (the owner's
 * latest edit wins), then id for determinism.
 */
export function resolveNightRate(
  date: string,
  baseRateMinor: number,
  overrides: readonly RateOverrideInput[],
): NightRate {
  let winner: RateOverrideInput | null = null;
  for (const o of overrides) {
    if (date < o.startDate || date > o.endDate) continue;
    if (!dowMaskIncludes(o.dowMask, date)) continue;
    if (
      !winner ||
      o.priority > winner.priority ||
      (o.priority === winner.priority &&
        (createdAtMs(o) > createdAtMs(winner) ||
          (createdAtMs(o) === createdAtMs(winner) && o.id < winner.id)))
    ) {
      winner = o;
    }
  }
  return winner
    ? { date, rateMinor: winner.rateMinor, overrideLabel: winner.label }
    : { date, rateMinor: baseRateMinor };
}

export function resolveStayRates(
  checkIn: string,
  checkOut: string,
  baseRateMinor: number,
  overrides: readonly RateOverrideInput[],
): StayRates {
  const nights = eachNight(checkIn, checkOut).map((date) =>
    resolveNightRate(date, baseRateMinor, overrides),
  );
  return {
    nights,
    totalMinor: nights.reduce((sum, n) => sum + n.rateMinor, 0),
  };
}

/** 30% of GHS 745.00 = GHS 223.50 exactly; halves round up to the nearest pesewa. */
export function computeDepositMinor(
  totalMinor: number,
  depositPercent: number,
): number {
  return Math.round((totalMinor * depositPercent) / 100);
}
