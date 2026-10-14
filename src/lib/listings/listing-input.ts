// Parsing the admin's listing form (plans/08 phase D). Pure: FormData in,
// a validated object or a field-specific error out. The server actions do
// the writes. Every word an agent types is kept as typed (trimmed): no
// rewriting, no generated copy (product rule).

import type {
  AreaUnit,
  FeatureGroupKey,
  ListingFacts,
  ListingFeatures,
  LotAreaUnit,
} from "@/db/schema/listings";
import { err, ok, type Result } from "@/lib/result";
import type { ListingStatus, PropertyKind } from "./format";

export const FEATURE_GROUPS: readonly FeatureGroupKey[] = [
  "interior",
  "exterior",
  "construction",
  "utilities",
  "parking",
  "fees",
  "lot",
];
const KINDS: readonly PropertyKind[] = ["single_family", "multi_family", "commercial", "campus", "mixed"];
const STATUSES: readonly ListingStatus[] = ["draft", "for_sale", "under_offer", "sold", "withdrawn"];
const AREA_UNITS: readonly AreaUnit[] = ["sqft", "sqm"];
const LOT_UNITS: readonly LotAreaUnit[] = ["sqft", "sqm", "acres", "hectares"];

export const LIMITS = {
  title: 140,
  line: 200,
  highlights: 3,
  featureItems: 40,
  description: 8000,
  address: 200,
} as const;

export interface PropertyInput {
  kind: PropertyKind;
  name: string | null;
  addressLine1: string;
  addressLine2: string | null;
  neighborhood: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  latitude: string | null;
  longitude: string | null;
}

export interface ListingInput {
  title: string;
  priceMinor: number | null;
  currency: string;
  highlights: string[];
  description: string | null;
  facts: ListingFacts;
  features: ListingFeatures;
  hideAddress: boolean;
  galleryMode: "lightbox" | "strip" | null;
}

type Source = { get(name: string): FormDataEntryValue | null };

function str(form: Source, name: string, max: number): string | null | undefined {
  const value = form.get(name);
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

/** "1,250,000" or "1250000.50" (whole currency units) to minor units. Null when blank. */
export function parsePrice(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  const cleaned = raw.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const minor = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function num(
  form: Source,
  name: string,
  opts: { min: number; max: number; integer?: boolean; step?: number },
): number | null | undefined {
  const raw = str(form, name, 20);
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < opts.min || value > opts.max) return undefined;
  if (opts.integer && !Number.isInteger(value)) return undefined;
  if (opts.step && Math.abs(value / opts.step - Math.round(value / opts.step)) > 1e-9) return undefined;
  return value;
}

/** One item per line, blank lines dropped, each line capped. */
export function lines(raw: string | null, maxItems: number): string[] | undefined {
  if (!raw) return [];
  const items = raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s+/, ""))
    .filter(Boolean);
  if (items.length > maxItems || items.some((item) => item.length > LIMITS.line)) return undefined;
  return items;
}

export function parsePropertyInput(form: Source): Result<PropertyInput> {
  const kind = form.get("kind");
  if (typeof kind !== "string" || !KINDS.includes(kind as PropertyKind)) {
    return err("PROPERTY_KIND", "Choose the kind of property.");
  }
  const addressLine1 = str(form, "addressLine1", LIMITS.address);
  if (!addressLine1) return err("ADDRESS_LINE1", "Add the street address. You can hide it on the page.");
  const fields = ["name", "addressLine2", "neighborhood", "locality", "region", "postalCode"] as const;
  const values: Record<(typeof fields)[number], string | null> = {
    name: null,
    addressLine2: null,
    neighborhood: null,
    locality: null,
    region: null,
    postalCode: null,
  };
  for (const field of fields) {
    const value = str(form, field, LIMITS.address);
    if (value === undefined) return err("ADDRESS_FIELD", "One of the address fields is too long.");
    values[field] = value;
  }
  const country = str(form, "countryCode", 2)?.toUpperCase() ?? null;
  if (!country || !/^[A-Z]{2}$/.test(country)) return err("COUNTRY_CODE", "Use a two-letter country code, like US or GH.");
  const latitude = num(form, "latitude", { min: -90, max: 90 });
  const longitude = num(form, "longitude", { min: -180, max: 180 });
  if (latitude === undefined || longitude === undefined || (latitude === null) !== (longitude === null)) {
    return err("COORDINATES", "Give both latitude and longitude as numbers, or leave both blank.");
  }
  return ok({
    kind: kind as PropertyKind,
    ...values,
    addressLine1,
    countryCode: country,
    latitude: latitude === null ? null : latitude.toFixed(6),
    longitude: longitude === null ? null : longitude.toFixed(6),
  });
}

export function parseListingInput(form: Source): Result<ListingInput> {
  const title = str(form, "title", LIMITS.title);
  if (!title) return err("LISTING_TITLE", `Add a title of up to ${LIMITS.title} characters.`);
  const price = parsePrice(str(form, "price", 30) ?? null);
  if (price === undefined) return err("LISTING_PRICE", "Write the price as a number, like 1,250,000, or leave it blank.");
  const currency = (str(form, "currency", 3) ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return err("LISTING_CURRENCY", "Use a three-letter currency code, like USD or GHS.");
  const highlights = lines(str(form, "highlights", 2000) ?? null, LIMITS.highlights);
  if (!highlights) return err("LISTING_HIGHLIGHTS", `Up to ${LIMITS.highlights} highlights, one per line.`);
  const description = str(form, "description", LIMITS.description);
  if (description === undefined) return err("LISTING_DESCRIPTION", "The description is too long.");

  const facts: ListingFacts = {};
  const factFields: [keyof ListingFacts, { min: number; max: number; integer?: boolean; step?: number }][] = [
    ["bedrooms", { min: 0, max: 500, integer: true }],
    ["bathrooms", { min: 0, max: 500, step: 0.5 }],
    ["interiorArea", { min: 1, max: 100_000_000 }],
    ["lotArea", { min: 0, max: 100_000_000 }],
    ["yearBuilt", { min: 1000, max: 2100, integer: true }],
    ["floors", { min: 1, max: 500, integer: true }],
    ["units", { min: 1, max: 100_000, integer: true }],
    ["parkingSpaces", { min: 0, max: 100_000, integer: true }],
  ];
  for (const [key, range] of factFields) {
    const value = num(form, key, range);
    if (value === undefined) return err("LISTING_FACT", `Check the ${key.replace(/([A-Z])/g, " $1").toLowerCase()} value.`);
    if (value !== null) (facts as Record<string, number>)[key] = value;
  }
  const areaUnit = form.get("areaUnit");
  if (typeof areaUnit === "string" && AREA_UNITS.includes(areaUnit as AreaUnit)) facts.areaUnit = areaUnit as AreaUnit;
  const lotUnit = form.get("lotAreaUnit");
  if (typeof lotUnit === "string" && LOT_UNITS.includes(lotUnit as LotAreaUnit)) facts.lotAreaUnit = lotUnit as LotAreaUnit;
  const zoning = str(form, "zoning", 60);
  if (zoning === undefined) return err("LISTING_FACT", "Keep zoning under 60 characters.");
  if (zoning) facts.zoning = zoning;

  const features: ListingFeatures = {};
  for (const group of FEATURE_GROUPS) {
    const items = lines(str(form, `features.${group}`, 10_000) ?? null, LIMITS.featureItems);
    if (!items) return err("LISTING_FEATURES", `Up to ${LIMITS.featureItems} lines per group, each under ${LIMITS.line} characters.`);
    if (items.length) features[group] = items;
  }

  const galleryMode = form.get("galleryMode");
  return ok({
    title,
    priceMinor: price,
    currency,
    highlights,
    description,
    facts,
    features,
    hideAddress: form.get("hideAddress") === "on",
    galleryMode: galleryMode === "lightbox" || galleryMode === "strip" ? galleryMode : null,
  });
}

export function parseStatus(value: unknown): ListingStatus | null {
  return typeof value === "string" && STATUSES.includes(value as ListingStatus) ? (value as ListingStatus) : null;
}

/** The timestamps a status change sets. publishedAt is kept once set: it records the FIRST time. */
export function statusTimestamps(
  next: ListingStatus,
  current: { publishedAt: Date | null; soldAt: Date | null },
  now: Date,
): { publishedAt: Date | null; soldAt: Date | null } {
  const isPublic = next === "for_sale" || next === "under_offer" || next === "sold";
  return {
    publishedAt: current.publishedAt ?? (isPublic ? now : null),
    soldAt: next === "sold" ? (current.soldAt ?? now) : null,
  };
}
