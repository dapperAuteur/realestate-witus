// Pure date math for the booking engine. Everything works on YYYY-MM-DD
// strings pinned to UTC so a night is the same night regardless of the
// server's timezone; wall-clock concerns (check-in hour, Africa/Accra) live
// in hotel_settings, not here.

import { err, ok, type Result } from "@/lib/result";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Longest stay the public flow accepts; admin blockouts bypass this. */
export const MAX_STAY_NIGHTS = 30;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = parseIsoDate(checkOut).getTime() - parseIsoDate(checkIn).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every night of a half-open stay [checkIn, checkOut) — checkout night excluded. */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < nights; i++) out.push(addDays(checkIn, i));
  return out;
}

/** rate_overrides.dow_mask convention: Mon=1<<0 .. Sun=1<<6. */
export function dowBit(value: string): number {
  // getUTCDay: Sun=0..Sat=6 → rotate so Mon=0..Sun=6.
  return 1 << ((parseIsoDate(value).getUTCDay() + 6) % 7);
}

/** Null/undefined mask means the override applies to every day in its range. */
export function dowMaskIncludes(
  mask: number | null | undefined,
  value: string,
): boolean {
  if (mask == null) return true;
  return (mask & dowBit(value)) !== 0;
}

export function validateStay(
  checkIn: string,
  checkOut: string,
  opts: { maxNights?: number } = {},
): Result<{ nights: number }> {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return err("INVALID_DATE", "Dates must be valid YYYY-MM-DD.");
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) {
    return err("INVALID_RANGE", "Check-out must be after check-in.");
  }
  const maxNights = opts.maxNights ?? MAX_STAY_NIGHTS;
  if (nights > maxNights) {
    return err("STAY_TOO_LONG", `Stays are limited to ${maxNights} nights.`);
  }
  return ok({ nights });
}

// ── Month helpers (admin calendars) ──────────────────────────────────────────

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isIsoMonth(value: string): boolean {
  return ISO_MONTH.test(value);
}

/** "2026-12" → its first day. */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** First day of the following month (half-open month ranges). */
export function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Every date of the month, in order. */
export function monthDays(month: string): string[] {
  return eachNight(monthStart(month), nextMonthStart(month));
}

/** The month ("YYYY-MM") a date belongs to. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}
