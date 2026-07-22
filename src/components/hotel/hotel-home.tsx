import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  attractions,
  events,
  hotelSettings,
  partners,
  roomTypes,
  siteSections,
} from "@/db/schema";
import type { Dictionary } from "@/lib/dictionaries";
import { latestPublishedAnnouncement } from "@/lib/campaigns";
import { hotelJsonLd } from "@/lib/seo";
import { thumbnailsForRoomTypes } from "@/lib/rooms";
import { BAND_TINT, templateFor } from "@/lib/templates";
import { resolveSectionConfig, type SectionKey } from "@/lib/sections";
import type { TenantRecord } from "@/lib/tenant";
import { ConciergeSection } from "./concierge-section";
import { ContactSection } from "./contact-section";
import { EventsSection } from "./events-section";
import { GuideSection } from "./guide-section";
import { HeroSection } from "./hero-section";
import { RoomsSection } from "./rooms-section";
import { TourSection } from "./tour-section";
import { TextSection } from "./text-section";

// The rung-2 renderer: sections draw in the owner's order, hidden ones never
// query. Every word inside comes from owner-written rows or the reviewed
// dictionary — no generated prose reaches guests (ecosystem rule).

/** Section key → site_sections.key (schema uses virtual_tour). */
const SITE_SECTION_KEYS: Partial<Record<SectionKey, string>> = {
  hero: "hero",
  about: "about",
  dining: "dining",
  tour: "virtual_tour",
};

export async function HotelHome({
  tenant,
  dict,
  lang,
}: {
  tenant: TenantRecord;
  dict: Dictionary;
  lang: string;
}) {
  const config = resolveSectionConfig(tenant.theme, tenant.flags);
  const tpl = templateFor(tenant.theme.templateKey);
  const need = new Set(config.order);

  const wantedSiteKeys = config.order
    .map((key) => SITE_SECTION_KEYS[key])
    .filter((key): key is string => Boolean(key));

  const [sectionRows, rooms, upcoming, approved, spots, settingsRows] =
    await Promise.all([
      wantedSiteKeys.length > 0
        ? db()
            .select()
            .from(siteSections)
            .where(
              and(
                eq(siteSections.tenantId, tenant.id),
                eq(siteSections.isPublished, true),
                inArray(siteSections.key, wantedSiteKeys),
              ),
            )
        : [],
      need.has("rooms")
        ? db()
            .select()
            .from(roomTypes)
            .where(
              and(eq(roomTypes.tenantId, tenant.id), eq(roomTypes.isActive, true)),
            )
            .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))
        : [],
      need.has("events")
        ? db()
            .select()
            .from(events)
            .where(
              and(
                eq(events.tenantId, tenant.id),
                eq(events.isPublished, true),
                gte(events.startsAt, new Date()),
              ),
            )
            .orderBy(asc(events.startsAt))
            .limit(3)
        : [],
      need.has("concierge")
        ? db()
            .select()
            .from(partners)
            .where(
              and(
                eq(partners.tenantId, tenant.id),
                eq(partners.status, "approved"),
              ),
            )
            .orderBy(asc(partners.sortOrder), asc(partners.name))
            .limit(6)
        : [],
      need.has("guide")
        ? db()
            .select()
            .from(attractions)
            .where(
              and(
                eq(attractions.tenantId, tenant.id),
                eq(attractions.isPublished, true),
              ),
            )
            .orderBy(asc(attractions.sortOrder), asc(attractions.name))
            .limit(6)
        : [],
      db()
        .select()
        .from(hotelSettings)
        .where(eq(hotelSettings.tenantId, tenant.id))
        .limit(1),
    ]);

  const byKey = new Map(sectionRows.map((row) => [row.key, row]));
  const roomThumbnails = await thumbnailsForRoomTypes(rooms.map((r) => r.id));
  const announcement = await latestPublishedAnnouncement(tenant.id).catch(() => null);
  const settings = settingsRows[0];
  const timezone = settings?.timezone ?? "Africa/Accra";
  const heroData = (byKey.get("hero")?.data ?? {}) as { imageUrl?: string };
  const jsonLd = await hotelJsonLd(tenant, heroData.imageUrl);

  const renderSection = (key: SectionKey) => {
    switch (key) {
          case "hero":
            return (
              <HeroSection
                key={key}
                tenant={tenant}
                row={byKey.get("hero")}
                variant={config.variants.hero}
                dict={dict}
                lang={lang}
                tpl={tpl}
              />
            );
          case "about":
            return (
              <TextSection
                key={key}
                id="about"
                fallbackTitle={dict.sections.aboutTitle}
                row={byKey.get("about")}
                tpl={tpl}
              />
            );
          case "rooms":
            return (
              <RoomsSection
                key={key}
                rooms={rooms}
                variant={config.variants.rooms}
                dict={dict}
                lang={lang}
                thumbnails={roomThumbnails}
                tpl={tpl}
              />
            );
          case "dining":
            return (
              <TextSection
                key={key}
                id="dining"
                fallbackTitle={dict.sections.diningTitle}
                row={byKey.get("dining")}
                tpl={tpl}
              />
            );
          case "events":
            return (
              <EventsSection
                key={key}
                upcoming={upcoming}
                timezone={timezone}
                dict={dict}
                lang={lang}
                tpl={tpl}
              />
            );
          case "concierge":
            return <ConciergeSection key={key} approved={approved} dict={dict} lang={lang} tpl={tpl} />;
          case "guide":
            return <GuideSection key={key} published={spots} dict={dict} tpl={tpl} />;
          case "tour":
            return (
              <TourSection key={key} row={byKey.get("virtual_tour")} dict={dict} tpl={tpl} />
            );
          case "contact":
            return (
              <ContactSection key={key} settings={settings} dict={dict} tpl={tpl} />
            );
    }
  };

  return (
    <main className={`pb-10 ${tpl.t.page}`}>
      <script
        type="application/ld+json"
        // Structured data only — every value is owner-entered fact.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {announcement ? (
        <div className="mx-auto max-w-4xl px-4 pt-6">
          <aside
            role={announcement.urgency === "urgent" ? "alert" : "status"}
            className={`rounded-xl border p-4 text-sm ${
              announcement.urgency === "urgent"
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <p className="font-semibold">{announcement.title}</p>
            <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-300">
              {announcement.body}
            </p>
          </aside>
        </div>
      ) : null}
      {config.order.map((key, index) => {
        const section = renderSection(key);
        if (!section) return null;
        // Full-bleed hero escapes the content container entirely.
        if (key === "hero" && tpl.hero === "fullbleed") {
          return <div key={key}>{section}</div>;
        }
        const banded = tpl.bands && index % 2 === 1;
        return (
          <div key={key} style={banded ? { background: BAND_TINT } : undefined}>
            <div className={`mx-auto max-w-4xl px-4 ${tpl.bands ? "" : "pt-0"}`}>
              {section}
            </div>
          </div>
        );
      })}
    </main>
  );
}
