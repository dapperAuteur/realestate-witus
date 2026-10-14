import type { ListingRow } from "@/lib/listings/admin";
import { FEATURE_GROUPS } from "@/lib/listings/listing-input";
import type { Dictionary } from "@/lib/dictionaries";

// The listing form, shared by New and Edit (plans/08 phase D). One plain form
// posting to a server action: works without JavaScript, every field labeled,
// hints tied to inputs. Values are the agent's own words, kept as typed.

export const FIELD =
  "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
export const LABEL = "block text-sm font-medium text-slate-800 dark:text-slate-200";
export const HINT = "mt-1 text-xs text-slate-600 dark:text-slate-400";
export const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";
export const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:border-slate-700 dark:hover:bg-slate-900";
export const ACCENT = { background: "var(--brand-accent)", color: "var(--brand-accent-fg)" };

type Property = {
  kind: string;
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
};

function Field({
  name,
  label,
  hint,
  defaultValue,
  required,
  type = "text",
  inputMode,
  maxLength,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  type?: string;
  inputMode?: "numeric" | "decimal" | "text";
  maxLength?: number;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={FIELD}
      />
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Area({
  name,
  label,
  hint,
  defaultValue,
  rows = 4,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  rows?: number;
}) {
  const id = `field-${name.replace(/\./g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={FIELD}
      />
      {hint ? (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function ListingForm({
  action,
  dict,
  lang,
  submitLabel,
  listing,
  property,
  agents,
}: {
  action: (formData: FormData) => Promise<void>;
  dict: Dictionary;
  lang: string;
  submitLabel: string;
  listing?: ListingRow;
  property?: Property;
  /** Shown only to owners and managers, who may reassign. */
  agents?: { id: string; label: string }[];
}) {
  const f = dict.admin.listings.form;
  const kinds = dict.listing.kinds;
  const facts = listing?.facts ?? {};
  const price = listing?.priceMinor !== null && listing?.priceMinor !== undefined ? String(listing.priceMinor / 100) : "";

  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="lang" value={lang} />
      {listing ? <input type="hidden" name="listingId" value={listing.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">{f.propertyTitle}</legend>
        <div className="sm:col-span-2">
          <label htmlFor="field-kind" className={LABEL}>
            {f.kind}
          </label>
          <select id="field-kind" name="kind" defaultValue={property?.kind ?? "single_family"} className={FIELD}>
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Field name="addressLine1" label={f.addressLine1} defaultValue={property?.addressLine1} required maxLength={200} />
        <Field name="addressLine2" label={f.addressLine2} defaultValue={property?.addressLine2} maxLength={200} />
        <Field name="neighborhood" label={f.neighborhood} defaultValue={property?.neighborhood} maxLength={200} />
        <Field name="locality" label={f.locality} defaultValue={property?.locality} maxLength={200} />
        <Field name="region" label={f.region} defaultValue={property?.region} maxLength={200} />
        <Field name="postalCode" label={f.postalCode} defaultValue={property?.postalCode} maxLength={200} />
        <Field name="countryCode" label={f.countryCode} hint={f.countryHint} defaultValue={property?.countryCode} required maxLength={2} />
        <Field name="name" label={f.name} hint={f.nameHint} defaultValue={property?.name} maxLength={200} />
        <Field name="latitude" label={f.latitude} inputMode="decimal" defaultValue={property?.latitude} />
        <Field name="longitude" label={f.longitude} hint={f.coordsHint} inputMode="decimal" defaultValue={property?.longitude} />
        <label className="flex items-start gap-3 sm:col-span-2">
          <input type="checkbox" name="hideAddress" defaultChecked={listing?.hideAddress} className="mt-1 h-5 w-5" />
          <span className="text-sm">{f.hideAddress}</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">{f.listingTitle}</legend>
        <div className="sm:col-span-2">
          <Field name="title" label={f.title} hint={f.titleHint} defaultValue={listing?.title} required maxLength={140} />
        </div>
        <Field name="price" label={f.price} hint={f.priceHint} inputMode="decimal" defaultValue={price} />
        <Field name="currency" label={f.currency} defaultValue={listing?.currency ?? "USD"} maxLength={3} />
        <div className="sm:col-span-2">
          <Area name="highlights" label={f.highlights} hint={f.highlightsHint} rows={3} defaultValue={listing?.highlights.join("\n")} />
        </div>
        <div className="sm:col-span-2">
          <Area name="description" label={f.description} hint={f.descriptionHint} rows={8} defaultValue={listing?.description ?? ""} />
        </div>
        <div>
          <label htmlFor="field-galleryMode" className={LABEL}>
            {f.galleryMode}
          </label>
          <select id="field-galleryMode" name="galleryMode" defaultValue={listing?.theme.galleryMode ?? "default"} className={FIELD}>
            <option value="default">{f.galleryDefault}</option>
            <option value="lightbox">{f.galleryLightbox}</option>
            <option value="strip">{f.galleryStrip}</option>
          </select>
        </div>
        {agents ? (
          <div>
            <label htmlFor="field-agent" className={LABEL}>
              {f.agent}
            </label>
            <select id="field-agent" name="agentUserId" defaultValue={listing?.agentUserId ?? ""} className={FIELD}>
              <option value="">{f.agentNone}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-lg font-semibold">{f.factsTitle}</legend>
        <Field name="bedrooms" label={f.bedrooms} inputMode="numeric" defaultValue={facts.bedrooms} />
        <Field name="bathrooms" label={f.bathrooms} hint={f.bathroomsHint} inputMode="decimal" defaultValue={facts.bathrooms} />
        <Field name="interiorArea" label={f.interiorArea} inputMode="decimal" defaultValue={facts.interiorArea} />
        <div>
          <label htmlFor="field-areaUnit" className={LABEL}>
            {f.areaUnit}
          </label>
          <select id="field-areaUnit" name="areaUnit" defaultValue={facts.areaUnit ?? "sqft"} className={FIELD}>
            <option value="sqft">{dict.listing.units.sqft}</option>
            <option value="sqm">{dict.listing.units.sqm}</option>
          </select>
        </div>
        <Field name="lotArea" label={f.lotArea} inputMode="decimal" defaultValue={facts.lotArea} />
        <div>
          <label htmlFor="field-lotAreaUnit" className={LABEL}>
            {f.lotAreaUnit}
          </label>
          <select id="field-lotAreaUnit" name="lotAreaUnit" defaultValue={facts.lotAreaUnit ?? "sqft"} className={FIELD}>
            {(["sqft", "sqm", "acres", "hectares"] as const).map((unit) => (
              <option key={unit} value={unit}>
                {dict.listing.units[unit]}
              </option>
            ))}
          </select>
        </div>
        <Field name="yearBuilt" label={f.yearBuilt} inputMode="numeric" defaultValue={facts.yearBuilt} />
        <Field name="floors" label={f.floors} inputMode="numeric" defaultValue={facts.floors} />
        <Field name="parkingSpaces" label={f.parkingSpaces} inputMode="numeric" defaultValue={facts.parkingSpaces} />
        <Field name="units" label={f.units} inputMode="numeric" defaultValue={facts.units} />
        <Field name="zoning" label={f.zoning} defaultValue={facts.zoning} maxLength={60} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-lg font-semibold">{f.featuresTitle}</legend>
        <p className={`${HINT} sm:col-span-2`}>{f.featuresHint}</p>
        {FEATURE_GROUPS.map((group) => (
          <Area
            key={group}
            name={`features.${group}`}
            label={dict.listing.features.groups[group]}
            rows={4}
            defaultValue={listing?.features[group]?.join("\n")}
          />
        ))}
      </fieldset>

      <div>
        <button type="submit" className={PRIMARY_BUTTON} style={ACCENT}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
