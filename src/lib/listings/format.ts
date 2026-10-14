// Pure display rules for a listing (plans/08 section 6.1). No DB, no React:
// the listing page, the embed, cards and emails all format the same way.

import type { AreaUnit, ListingFacts } from "@/db/schema/listings";

export type ListingStatus = "draft" | "for_sale" | "under_offer" | "sold" | "withdrawn";
export type PropertyKind = "single_family" | "multi_family" | "commercial" | "campus" | "mixed";

const PUBLIC: ReadonlySet<ListingStatus> = new Set(["for_sale", "under_offer", "sold"]);

/** For sale, under offer and sold are public; draft and withdrawn are not. */
export function isPublicStatus(status: ListingStatus): boolean {
  return PUBLIC.has(status);
}

/** Whole units, no cents: "$1,250,000". Null when the price is on request. */
export function formatPrice(priceMinor: number | null, currency: string, locale = "en-US"): string | null {
  if (priceMinor === null) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(priceMinor / 100);
  } catch {
    // An unknown currency code in data: show something rather than crash.
    return `${currency} ${Math.round(priceMinor / 100).toLocaleString(locale)}`;
  }
}

export function formatNumber(value: number, locale = "en-US", maxFraction = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFraction }).format(value);
}

/** Price per unit of interior area, or null unless both numbers exist. */
export function formatPricePerArea(
  priceMinor: number | null,
  currency: string,
  area: number | undefined,
  locale = "en-US",
): string | null {
  if (priceMinor === null || !area || area <= 0) return null;
  return formatPrice(Math.round(priceMinor / area), currency, locale);
}

export type FactKey = "bedrooms" | "bathrooms" | "area" | "pricePerArea" | "units" | "zoning";

export interface FactCell {
  key: FactKey;
  /** Formatted value: "4", "2.5", "2,140", "$584". */
  value: string;
  /** For area and price-per-area cells: which unit label the page shows. */
  unit?: AreaUnit;
}

/** Commercial-style facts (area, units, zoning) instead of bedrooms and bathrooms. */
export function isCommercialKind(kind: PropertyKind): boolean {
  return kind === "commercial" || kind === "campus" || kind === "mixed";
}

/**
 * The summary's fact strip (plans/08 6.1 item 2), in order, omitting cells
 * with no value. Residential: beds, baths, area, price per area. Commercial:
 * area, units, zoning, price per area.
 */
export function factStrip(input: {
  kind: PropertyKind;
  facts: ListingFacts;
  priceMinor: number | null;
  currency: string;
  locale?: string;
}): FactCell[] {
  const { facts, locale = "en-US" } = input;
  const unit = facts.areaUnit ?? "sqft";
  const cells: FactCell[] = [];
  const push = (key: FactKey, value: string | null | undefined, cellUnit?: AreaUnit) => {
    if (value) cells.push(cellUnit ? { key, value, unit: cellUnit } : { key, value });
  };
  const area = facts.interiorArea ? formatNumber(facts.interiorArea, locale, 0) : null;
  const perArea = formatPricePerArea(input.priceMinor, input.currency, facts.interiorArea, locale);

  if (isCommercialKind(input.kind)) {
    push("area", area, unit);
    push("units", facts.units !== undefined ? formatNumber(facts.units, locale, 0) : null);
    push("zoning", facts.zoning?.trim() || null);
  } else {
    push("bedrooms", facts.bedrooms !== undefined ? formatNumber(facts.bedrooms, locale, 0) : null);
    push("bathrooms", facts.bathrooms !== undefined ? formatNumber(facts.bathrooms, locale, 1) : null);
    push("area", area, unit);
  }
  push("pricePerArea", perArea, unit);
  return cells;
}

export interface AddressParts {
  addressLine1: string;
  addressLine2: string | null;
  neighborhood: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
}

/**
 * The two address lines the summary shows. When the agent hides the exact
 * address, only the area shows (neighborhood, then locality, then region):
 * never the street, and never derived from it.
 */
export function displayAddress(parts: AddressParts, hide: boolean): { primary: string; secondary: string | null } {
  const clean = (value: string | null | undefined) => value?.trim() || null;
  const neighborhood = clean(parts.neighborhood);
  const locality = clean(parts.locality);
  const region = clean(parts.region);
  if (hide) {
    const primary = neighborhood ?? locality ?? region ?? "";
    const rest = [primary === locality ? null : locality, primary === region ? null : region].filter(Boolean);
    return { primary, secondary: rest.length ? rest.join(", ") : null };
  }
  const primary = [clean(parts.addressLine1), clean(parts.addressLine2)].filter(Boolean).join(", ");
  const cityLine = [locality, [region, clean(parts.postalCode)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const secondary = [neighborhood, cityLine].filter(Boolean).join(" · ");
  return { primary, secondary: secondary || null };
}

/**
 * Coordinates for the map when the address is hidden: rounded to two decimal
 * places (about a kilometer), so the map shows the area without pointing at
 * the house.
 */
export function approximateCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/** The agent's description as paragraphs: blank lines separate them. */
export function descriptionParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
