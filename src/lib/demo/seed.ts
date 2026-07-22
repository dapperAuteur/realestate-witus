import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attractions,
  events,
  hotelSettings,
  partners,
  payments,
  rateOverrides,
  reservations,
  roomTypes,
  roomUnits,
  siteSections,
  tenantDomains,
  tenants,
  unitClaims,
} from "@/db/schema";

// BAM Hotel demo content (plans/07/08), shared by scripts/seed-demo.ts and
// the nightly reset cron. Copy is demo placeholder for a FICTIONAL hotel —
// BAM reviewed the seed once; phone numbers do not route; the hero image is
// CC0 (Wikimedia) hotlinked as an interim until Cloudinary hosts a copy.

export const DEMO_TENANT_SLUG = "bam-hotel";
export const DEMO_HOST = "demo.stay.witus.online";

const HERO_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/1/17/A_serene_view_of_labadi_Beach%2C_Accra.jpg";

function daysFromNow(days: number, hourUtc = 18): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

/** Upserts the tenant row + domain mapping; returns the tenant id. */
export async function ensureDemoTenant(): Promise<string> {
  const [tenant] = await db()
    .insert(tenants)
    .values({
      slug: DEMO_TENANT_SLUG,
      name: "BAM Hotel",
      tagline: "Your rooftop home in Osu, Accra",
      flags: { dining: true, events: true, concierge: true, poweredBy: true },
      theme: { presetKey: "atlantic", fontPairKey: "classic", templateKey: "editorial" },
      payment: {},
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        name: "BAM Hotel",
        tagline: "Your rooftop home in Osu, Accra",
        // Reset undoes demo-admin design/flag experiments too.
        flags: { dining: true, events: true, concierge: true, poweredBy: true },
        theme: { presetKey: "atlantic", fontPairKey: "classic", templateKey: "editorial" },
        updatedAt: new Date(),
      },
    })
    .returning({ id: tenants.id });
  await db()
    .insert(tenantDomains)
    .values({ tenantId: tenant.id, host: DEMO_HOST, isPrimary: true })
    .onConflictDoNothing({ target: tenantDomains.host });
  return tenant.id;
}

export async function demoTenantHasContent(tenantId: string): Promise<boolean> {
  const existing = await db()
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(eq(roomTypes.tenantId, tenantId))
    .limit(1);
  return existing.length > 0;
}

/**
 * Deletes everything content- and booking-shaped for the demo tenant, in FK
 * order (reservations restrict room-type deletes, so they go first). Every
 * statement filters the demo tenant id — nothing here can touch a real hotel.
 */
export async function wipeDemoContent(tenantId: string): Promise<void> {
  await db().delete(payments).where(eq(payments.tenantId, tenantId));
  await db().delete(unitClaims).where(eq(unitClaims.tenantId, tenantId));
  await db().delete(reservations).where(eq(reservations.tenantId, tenantId));
  // Deleting events cascades event_rsvps.
  await db().delete(events).where(eq(events.tenantId, tenantId));
  await db().delete(partners).where(eq(partners.tenantId, tenantId));
  await db().delete(attractions).where(eq(attractions.tenantId, tenantId));
  await db().delete(siteSections).where(eq(siteSections.tenantId, tenantId));
  await db().delete(rateOverrides).where(eq(rateOverrides.tenantId, tenantId));
  await db().delete(roomUnits).where(eq(roomUnits.tenantId, tenantId));
  await db().delete(roomTypes).where(eq(roomTypes.tenantId, tenantId));
  await db().delete(hotelSettings).where(eq(hotelSettings.tenantId, tenantId));
}

export async function seedDemoContent(tenantId: string): Promise<void> {
  await db().insert(hotelSettings).values({
    tenantId,
    hotelName: "BAM Hotel",
    address: "12 Oxford Street, Osu, Accra, Ghana",
    email: "demo@stay.witus.online",
    timezone: "Africa/Accra",
    bookingMode: "instant_deposit",
    depositPercent: 30,
  });

  const [garden, rooftop, family] = await db()
    .insert(roomTypes)
    .values([
      {
        tenantId,
        slug: "garden-queen",
        name: "Garden Queen",
        description:
          "A calm queen room opening onto the courtyard garden. Demo copy — replace with your own.",
        baseRateMinor: 45_000,
        maxOccupancy: 2,
        bedConfig: "1 queen",
        sortOrder: 1,
      },
      {
        tenantId,
        slug: "rooftop-suite",
        name: "Rooftop Suite",
        description:
          "Top-floor suite beside the rooftop bar, with a private terrace over Oxford Street. Demo copy.",
        baseRateMinor: 85_000,
        maxOccupancy: 3,
        bedConfig: "1 king + daybed",
        sortOrder: 2,
      },
      {
        tenantId,
        slug: "family-room",
        name: "Family Room",
        description:
          "Two connecting rooms for up to five guests, a short walk from Labadi Beach. Demo copy.",
        baseRateMinor: 65_000,
        maxOccupancy: 5,
        bedConfig: "1 queen + 3 singles",
        sortOrder: 3,
      },
    ])
    .returning({ id: roomTypes.id });

  await db()
    .insert(roomUnits)
    .values([
      { tenantId, roomTypeId: garden.id, unitNumber: "101", floor: "1" },
      { tenantId, roomTypeId: garden.id, unitNumber: "102", floor: "1" },
      { tenantId, roomTypeId: garden.id, unitNumber: "103", floor: "1" },
      { tenantId, roomTypeId: rooftop.id, unitNumber: "301", floor: "3" },
      { tenantId, roomTypeId: rooftop.id, unitNumber: "302", floor: "3" },
      { tenantId, roomTypeId: family.id, unitNumber: "201", floor: "2" },
      { tenantId, roomTypeId: family.id, unitNumber: "202", floor: "2" },
    ]);

  const year = new Date().getUTCFullYear();
  await db()
    .insert(rateOverrides)
    .values([
      ...[garden, rooftop, family].map((rt, i) => ({
        tenantId,
        roomTypeId: rt.id,
        label: "Detty December",
        kind: "seasonal" as const,
        startDate: `${year}-12-01`,
        endDate: `${year + 1}-01-02`,
        rateMinor: [68_000, 128_000, 98_000][i],
        priority: 10,
      })),
      {
        tenantId,
        roomTypeId: rooftop.id,
        label: "Weekend",
        kind: "weekend" as const,
        startDate: `${year}-01-01`,
        endDate: `${year + 1}-12-31`,
        dowMask: (1 << 4) | (1 << 5),
        rateMinor: 95_000,
        priority: 5,
      },
    ]);

  await db()
    .insert(siteSections)
    .values([
      {
        tenantId,
        key: "hero",
        title: "BAM Hotel",
        body: "Nine rooms, a rooftop bar, and the best of Osu outside the front door. This is the Stay.WitUS demo property — everything you see is editable by the hotel team.",
        data: {
          imageUrl: HERO_IMAGE,
          imageAlt: "Labadi Beach at golden hour, palm trees over calm surf",
        },
        isPublished: true,
      },
      {
        tenantId,
        key: "about",
        title: "A small hotel that knows its neighborhood",
        body: "BAM Hotel is the fictional demo property for Stay.WitUS.\n\nEverything on this site — rooms, prices, events, the local guide, this very text — is managed by the hotel team from a phone, and every booking is backed by real-time availability with deposits by mobile money or card.",
        isPublished: true,
      },
      {
        tenantId,
        key: "dining",
        title: "Rooftop kitchen & bar",
        body: "Breakfast until 11, small plates and grills from sunset. Fridays bring live highlife on the roof.\n\nDemo copy — a real property replaces this with its own menu story.",
        isPublished: true,
      },
    ]);

  await db()
    .insert(attractions)
    .values([
      {
        tenantId,
        name: "Labadi Beach",
        zone: "walkable",
        category: "beach",
        walkMinutes: 12,
        blurb: "Accra's busiest beach. Go before noon for space, bring cedis for a lounger.",
        sortOrder: 1,
        isPublished: true,
      },
      {
        tenantId,
        name: "Osu Night Market",
        zone: "walkable",
        category: "food_drink",
        walkMinutes: 6,
        blurb: "Grilled tilapia, kelewele, and kenkey after dark. Cash only.",
        sortOrder: 2,
        isPublished: true,
      },
      {
        tenantId,
        name: "Kwame Nkrumah Memorial Park",
        zone: "day_trip",
        category: "culture",
        driveMinutes: 15,
        blurb: "The mausoleum and museum for Ghana's first president. An hour well spent.",
        sortOrder: 3,
        isPublished: true,
      },
      {
        tenantId,
        name: "Aburi Botanical Gardens",
        zone: "day_trip",
        category: "nature",
        driveMinutes: 50,
        blurb: "Cool hills, colonial-era palms, and the best picnic spot near Accra.",
        sortOrder: 4,
        isPublished: true,
      },
    ]);

  await db()
    .insert(partners)
    .values([
      {
        tenantId,
        slug: "kojo-airport-rides",
        name: "Kojo — Airport & Day Trips",
        category: "driver",
        blurb: "Reliable airport pickups and day trips as far as Cape Coast. Demo partner.",
        whatsappE164: "+233200000001",
        priceNote: "from GHS 120 airport",
        status: "approved",
        consentAt: new Date(),
        approvedAt: new Date(),
        sortOrder: 1,
      },
      {
        tenantId,
        slug: "amas-accra-walks",
        name: "Ama's Accra Walks",
        category: "tour_guide",
        blurb: "Three-hour walking tours of Jamestown and Osu with a born-and-raised guide. Demo partner.",
        whatsappE164: "+233200000002",
        priceNote: "GHS 250 per group",
        status: "approved",
        consentAt: new Date(),
        approvedAt: new Date(),
        sortOrder: 2,
      },
    ]);

  await db()
    .insert(events)
    .values([
      {
        tenantId,
        slug: "highlife-rooftop-night",
        title: "Highlife Rooftop Night",
        description:
          "Live band on the roof, small plates from the kitchen. Free for guests. Demo event.",
        kind: "hotel",
        startsAt: daysFromNow(10),
        locationText: "Rooftop bar",
        rsvpMode: "free_rsvp",
        capacity: 40,
        isPublished: true,
      },
      {
        tenantId,
        slug: "kente-weaving-workshop",
        title: "Kente Weaving Workshop",
        description:
          "A visiting master weaver from the Volta Region sets up a loom in the courtyard. Demo event.",
        kind: "cultural",
        startsAt: daysFromNow(24, 14),
        locationText: "Courtyard",
        rsvpMode: "free_rsvp",
        capacity: 15,
        isPublished: true,
      },
    ]);
}
