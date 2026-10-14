import type { FeatureGroupKey } from "@/db/schema/listings";
import { presetByKey } from "@/lib/brand-presets";
import type { Dictionary } from "@/lib/dictionaries";
import {
  approximateCoordinates,
  descriptionParagraphs,
  displayAddress,
  factStrip,
  formatNumber,
  formatPrice,
  formatPricePerArea,
  type ListingStatus,
  type PropertyKind,
} from "@/lib/listings/format";
import type { ListingPageData } from "@/lib/listings/queries";
import type { TenantRecord } from "@/lib/tenant";
import type { InquiryIntent } from "@/lib/tour/tour-links";
import type { ListingTourLabels } from "@/components/tour/listing-tour";
import { ActionBar, ActionCard } from "./action-panel";
import { ContactButton } from "./contact-button";
import { ExpandableText, FeatureGroup } from "./expandable";
import { FloorPlanSection } from "./floor-plan-section";
import { InquiryForm } from "./inquiry-form";
import { ListingProvider } from "./listing-provider";
import { ListingTopBar } from "./listing-top-bar";
import { LocationMap } from "./location-map";
import { MediaHero } from "./media-hero";
import { TourSection } from "./tour-section";
import { ViewBeacon } from "./view-beacon";

// The public listing page (plans/08 section 6, design lock 2026-10-14).
// Light-locked and photography-first (plans/03), hand-rolled Tailwind, slate
// neutrals with the agency's accent. Server-rendered: the summary, facts and
// description are in the HTML for search engines; the tour, gallery, map and
// form hydrate around them.

export function tourLabels(dict: Dictionary): ListingTourLabels {
  const t = dict.tour;
  return {
    viewer: {
      application: t.application,
      sceneLink: t.sceneLink,
      sceneLinkFallback: t.sceneLinkFallback,
      loadErrorTitle: t.loadErrorTitle,
      loadErrorBody: t.loadErrorBody,
      floorChanged: t.floorChanged,
      links: t.links,
      moments: t.moments,
    },
    rooms: t.rooms,
    open: t.open,
    roomCount: t.roomCount,
  };
}

function formatDate(value: Date | null, lang: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(value);
}

export function ListingView({
  data,
  tenant,
  dict,
  lang,
  startTourOpen,
  preview,
  initialInquiry,
}: {
  data: ListingPageData;
  tenant: TenantRecord;
  dict: Dictionary;
  lang: string;
  startTourOpen: boolean;
  /** Staff viewing a listing buyers can't see yet. */
  preview: boolean;
  /** `?inquiry=`: the embed's pinned action sent the buyer here for this form. */
  initialInquiry?: InquiryIntent | null;
}) {
  const { listing, property, photos, agent, tour } = data;
  const d = dict.listing;
  const status = listing.status as ListingStatus;
  const kind = property.kind as PropertyKind;
  const address = displayAddress(property, listing.hideAddress);
  const place = address.primary || listing.title;
  const price = formatPrice(listing.priceMinor, listing.currency, lang) ?? d.priceOnRequest;
  const unitLabel = (unit: keyof typeof d.units | undefined) => d.units[unit ?? "sqft"];
  const cells = factStrip({
    kind,
    facts: listing.facts,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    locale: lang,
  });
  const agencyName = tenant.theme.name ?? tenant.name;
  const agentName = agent?.name?.trim() || d.agent.fallbackName;
  const galleryMode = listing.theme.galleryMode ?? tenant.theme.galleryMode ?? "lightbox";
  const paragraphs = descriptionParagraphs(listing.description);
  const highlights = listing.highlights.filter((line) => line.trim());
  const groupKeys = Object.keys(d.features.groups) as FeatureGroupKey[];
  const featureGroups = groupKeys
    .map((key) => ({ key, items: (listing.features[key] ?? []).filter((item) => item.trim()) }))
    .filter((group) => group.items.length > 0);

  const facts = listing.facts;
  const pricePerArea = formatPricePerArea(listing.priceMinor, listing.currency, facts.interiorArea, lang);
  const keyFacts = [
    { label: d.overview.type, value: d.kinds[kind] },
    facts.yearBuilt ? { label: d.overview.yearBuilt, value: String(facts.yearBuilt) } : null,
    facts.lotArea
      ? { label: d.overview.lot, value: `${formatNumber(facts.lotArea, lang, 2)} ${d.units[facts.lotAreaUnit ?? "sqft"]}` }
      : null,
    pricePerArea
      ? { label: d.overview.pricePerArea.replace("{unit}", unitLabel(facts.areaUnit)), value: pricePerArea }
      : null,
    facts.parkingSpaces !== undefined ? { label: d.overview.parking, value: String(facts.parkingSpaces) } : null,
    facts.floors ? { label: d.overview.floors, value: String(facts.floors) } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  const rawLat = property.latitude ? Number(property.latitude) : null;
  const rawLng = property.longitude ? Number(property.longitude) : null;
  const coords =
    rawLat !== null && rawLng !== null && Number.isFinite(rawLat) && Number.isFinite(rawLng)
      ? listing.hideAddress
        ? approximateCoordinates(rawLat, rawLng)
        : { lat: rawLat, lng: rawLng }
      : null;

  const sections = [
    { id: "overview", label: d.sections.overview },
    tour ? { id: "tour", label: d.sections.tour } : null,
    tour?.floorPlans ? { id: "floor-plan", label: d.sections.floorPlan } : null,
    featureGroups.length ? { id: "facts", label: d.sections.facts } : null,
    coords ? { id: "location", label: d.sections.location } : null,
    { id: "agent", label: d.sections.agent },
  ].filter((section): section is { id: string; label: string } => section !== null);

  const listedOn = formatDate(listing.publishedAt, lang);
  const updatedOn = formatDate(listing.updatedAt, lang);
  const country = (() => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" }).of(property.countryCode) ?? property.countryCode;
    } catch {
      return property.countryCode;
    }
  })();
  const breadcrumb = [country, property.region, property.locality, property.neighborhood].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  const posterUrl = tour?.scenes.find((scene) => scene.id === tour.startSceneId)?.thumbnail ?? photos[0]?.url;

  return (
    <ListingProvider>
      <div className="bg-white pb-28 text-slate-900 [color-scheme:light] lg:pb-12">
        <ListingTopBar
          slug={listing.slug}
          title={listing.title}
          backHref={`/${lang}`}
          sections={sections}
          // On the platform host "back" is the product landing, not an agency's listings.
          labels={tenant.flags.platform ? { ...d.header, back: dict.common.brand } : d.header}
        />
        {preview ? (
          <p role="note" className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950">
            {d.previewNotice}
          </p>
        ) : null}

        <main className="mx-auto max-w-6xl px-4 pt-4">
          <MediaHero
            photos={photos}
            status={status}
            galleryMode={galleryMode}
            sections={{
              tour: Boolean(tour),
              floorPlan: Boolean(tour?.floorPlans),
              beforeAfter: Boolean(tour?.timeline),
              map: Boolean(coords),
            }}
            labels={{
              ...d.media,
              gallery: d.media.gallery.replace("{title}", listing.title),
              status: d.status[status],
            }}
          />

          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-12">
              <section id="overview" aria-labelledby="listing-address" className="scroll-mt-28 space-y-6">
                <div>
                  <p className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl" style={{ fontFamily: "var(--font-heading, inherit)" }}>
                    {price}
                  </p>
                  <h1 id="listing-address" className="mt-2 text-xl font-semibold text-slate-900">
                    {address.primary || listing.title}
                  </h1>
                  {address.secondary ? <p className="text-slate-600">{address.secondary}</p> : null}
                </div>

                {cells.length > 0 ? (
                  <dl className="flex flex-wrap divide-x divide-slate-200 rounded-xl border border-slate-200">
                    {cells.map((cell) => (
                      <div key={cell.key} className="flex min-w-[6.5rem] flex-1 flex-col-reverse px-4 py-3">
                        <dt className="text-sm text-slate-600">
                          {cell.key === "area"
                            ? d.facts.area.replace("{unit}", unitLabel(cell.unit))
                            : cell.key === "pricePerArea"
                              ? d.facts.pricePerArea.replace("{unit}", unitLabel(cell.unit))
                              : d.facts[cell.key]}
                        </dt>
                        <dd className="text-xl font-bold text-slate-900">{cell.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <div>
                  <p className="text-lg font-semibold text-slate-900">{listing.title}</p>
                  {highlights.length ? (
                    <ul aria-label={d.highlights} className="mt-2 grid gap-2 sm:grid-cols-2">
                      {highlights.map((line, i) => (
                        <li key={i} className="flex gap-2 text-slate-800">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--brand-accent)" }} />
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {keyFacts.length ? (
                  <div>
                    <h2 className="sr-only">{d.overview.keyFacts}</h2>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {keyFacts.map((fact) => (
                        <div key={fact.label} className="flex flex-col-reverse rounded-lg bg-slate-100 px-3 py-2.5">
                          <dt className="text-xs text-slate-600">{fact.label}</dt>
                          <dd className="font-semibold text-slate-900">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                {paragraphs.length ? (
                  <div>
                    <h2 className="mb-2 text-xl font-semibold text-slate-900">{d.overview.title}</h2>
                    <ExpandableText paragraphs={paragraphs} readMore={d.overview.readMore} readLess={d.overview.readLess} />
                  </div>
                ) : null}

                <p className="text-sm text-slate-600">
                  {d.overview.listedBy.replace("{agent}", agentName).replace("{brokerage}", agencyName)}
                  {listedOn ? <> · {d.overview.listedOn.replace("{date}", listedOn)}</> : null}
                </p>
              </section>

              {tour ? (
                <TourSection
                  slug={listing.slug}
                  tour={tour}
                  title={d.sections.tour}
                  posterUrl={posterUrl}
                  startOpen={startTourOpen}
                  pinColor={presetByKey(tenant.theme.presetKey).accent}
                  labels={tourLabels(dict)}
                />
              ) : null}

              {tour?.floorPlans ? (
                <FloorPlanSection floorPlans={tour.floorPlans} scenes={tour.scenes} labels={d.floorPlan} />
              ) : null}

              {featureGroups.length ? (
                <section id="facts" aria-labelledby="facts-title" className="scroll-mt-28">
                  <h2 id="facts-title" className="mb-4 text-xl font-semibold text-slate-900">
                    {d.features.title}
                  </h2>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {featureGroups.map((group) => (
                      <FeatureGroup
                        key={group.key}
                        heading={d.features.groups[group.key]}
                        items={group.items}
                        showMore={d.features.showMore}
                        showLess={d.features.showLess}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {coords ? (
                <section id="location" aria-labelledby="location-title" className="scroll-mt-28">
                  <h2 id="location-title" className="mb-1 text-xl font-semibold text-slate-900">
                    {d.location.title}
                  </h2>
                  <p className="mb-3 text-slate-600">
                    {listing.hideAddress ? d.location.approximate : [address.primary, address.secondary].filter(Boolean).join(", ")}
                  </p>
                  <LocationMap
                    lat={coords.lat}
                    lng={coords.lng}
                    approximate={listing.hideAddress}
                    label={d.location.mapLabel.replace("{place}", place)}
                    loading={d.location.loading}
                    attribution={d.location.attribution}
                  />
                </section>
              ) : null}

              <section id="agent" aria-labelledby="agent-title" className="scroll-mt-28 rounded-2xl border border-slate-200 p-5 sm:p-6">
                <h2 id="agent-title" className="text-xl font-semibold text-slate-900">
                  {d.agent.title}
                </h2>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {agent?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agent.image} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl font-semibold text-slate-700">
                      {agentName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{agentName}</p>
                    <p className="text-slate-600">{agencyName}</p>
                  </div>
                  <ContactButton
                    intent="question"
                    className="inline-flex min-h-11 items-center rounded-lg border-2 px-4 font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
                  >
                    {d.agent.contact.replace("{name}", agentName)}
                  </ContactButton>
                </div>
              </section>

              <InquiryForm
                slug={listing.slug}
                surface="page"
                place={place}
                agentName={agentName}
                agencyName={agencyName}
                initialIntent={initialInquiry ?? undefined}
                labels={d.inquiry}
              />
            </div>

            <div className="hidden lg:block">
              <div className="sticky top-32">
                <ActionCard agentName={agentName} agencyName={agencyName} agentImage={agent?.image ?? null} labels={d.actions} />
              </div>
            </div>
          </div>

          <footer className="mt-16 space-y-3 border-t border-slate-200 pt-6 text-sm text-slate-600">
            {breadcrumb.length ? (
              <nav aria-label={d.footer.breadcrumb}>
                <ol className="flex flex-wrap gap-x-2">
                  {breadcrumb.map((part, i) => (
                    <li key={i} className="flex gap-2">
                      {i > 0 ? <span aria-hidden="true">›</span> : null}
                      {part}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            {updatedOn ? <p>{d.footer.updated.replace("{date}", updatedOn)}</p> : null}
            {property.countryCode === "US" ? <p>{d.footer.fairHousing}</p> : null}
            <ContactButton
              intent="question"
              prefill={d.footer.accessibilityMessage.replace("{place}", place)}
              className="inline-flex min-h-11 items-center font-semibold text-slate-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {d.footer.accessibility}
            </ContactButton>
          </footer>
        </main>

        <ActionBar labels={d.actions} />
        {preview ? null : <ViewBeacon slug={listing.slug} surface="page" />}
      </div>
    </ListingProvider>
  );
}
