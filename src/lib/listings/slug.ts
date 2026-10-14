// Listing slugs: readable, global (they sit in embed URLs on other people's
// sites), and never derived from anything a seller would not want public.
// The caller passes the text (usually the listing title); a random suffix
// keeps two "3 bed house in Osu" listings apart without a lookup loop.

const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l, o, 0, 1

/** Lowercase ASCII words joined by hyphens, at most `max` characters, cut at a word boundary. */
export function slugify(text: string, max = 60): string {
  const base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > max / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

/** Six characters from an unambiguous alphabet. */
export function randomSlugSuffix(random: (n: number) => Uint8Array = defaultRandom): string {
  return Array.from(random(6), (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join("");
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function listingSlug(text: string, suffix: string): string {
  return `${slugify(text) || "listing"}-${suffix}`;
}

/** What a slug in a URL must look like before we query with it. */
export function isListingSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}
