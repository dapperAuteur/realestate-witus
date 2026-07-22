import { customType } from "drizzle-orm/pg-core";

/** Case-insensitive text (Postgres citext). Extension created in migration 0000_extensions. */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * Postgres daterange, stored/read as its text form, e.g. "[2026-12-01,2026-12-05)".
 * Half-open [check_in, check_out) so back-to-back stays never overlap.
 * The overlap-exclusion constraint on unit_claims lives in raw SQL
 * (migration 0000_extensions) because drizzle-kit cannot express EXCLUDE.
 */
export const daterange = customType<{ data: string }>({
  dataType() {
    return "daterange";
  },
});

/** Builds the daterange literal for a stay: [checkIn, checkOut). Dates as YYYY-MM-DD. */
export function stayRange(checkIn: string, checkOut: string): string {
  return `[${checkIn},${checkOut})`;
}

/** Inverse of stayRange for claims read back from the DB. */
export function parseStayRange(
  stay: string,
): { checkIn: string; checkOut: string } | null {
  const m = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/.exec(stay);
  return m ? { checkIn: m[1], checkOut: m[2] } : null;
}
