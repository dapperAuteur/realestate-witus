// Reservation codes: the guest's lookup key, spoken over the phone and typed
// from a confirmation email — short, uppercase, no ambiguous glyphs (0/O, 1/I/L).

/** Crockford-ish alphabet without lookalikes. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "sankofa-house-osu" → "SAN"; anything without letters/digits → "STA". */
export function tenantCodePrefix(slug: string): string {
  const cleaned = slug.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned || "STA").slice(0, 3);
}

/**
 * e.g. OSU-2026-K7M2. Random suffix instead of a per-tenant sequence: the
 * unique index on reservations.code plus insert-retry handles the rare
 * collision without a counter table.
 */
export function generateReservationCode(
  slug: string,
  year: number,
  random: () => number = Math.random,
): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return `${tenantCodePrefix(slug)}-${year}-${suffix}`;
}
