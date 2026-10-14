// Listings, tours and the admin writes against a real database (plans/08
// phases A to D). Skips without a database URL, and until migration 0001 has
// run there (user task 12), so it never fails a branch before BAM migrates.

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  listingInquiries,
  listingPhotos,
  listings,
  mediaAssets,
  sceneLinks,
  sceneMomentPanoramas,
  tenantMemberships,
  tenants,
  tourScenes,
  users,
} from "@/db/schema";
import type { TenantRecord } from "@/lib/tenant";
import {
  addFloorPlan,
  addHotspot,
  addLink,
  addMoment,
  autoArrangeFloor,
  deleteMoment,
  setMomentHeading,
  setMomentPhoto,
  createScenes,
  placeSceneOnPlan,
  setSceneStatuses,
  setStartScene,
  tourEditData,
  updateLink,
} from "@/lib/tour/admin";
import {
  assignableAgents,
  attachPhotos,
  changeListingStatus,
  createListing,
  findOwnedListing,
  listingEditData,
  listingsBoard,
  movePhoto,
} from "./admin";
import { submitInquiry } from "./inquiries";
import type { ListingInput, PropertyInput } from "./listing-input";
import { applyPrivacyEdit } from "@/lib/tour/privacy";
import { emptyPrivacyRecipe } from "@/lib/tour/privacy-edit";
import { getListingPage, listPublicListings, loadAgent, recordListingView } from "./queries";

const hasDb = Boolean(process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL);

// Ready once the newest migration this suite needs has run: 0003 adds
// scene_moment_panoramas.privacy_recipe. Before that, writes to those columns
// fail, so skip rather than fail a branch BAM hasn't migrated yet.
async function tablesExist(): Promise<boolean> {
  const result = (await db().execute(
    sql`select 1 as ok from information_schema.columns where table_name = 'scene_moment_panoramas' and column_name = 'privacy_recipe'`,
  )) as unknown as { rows: { ok: number }[] };
  return result.rows.length > 0;
}

const ready = hasDb && (await tablesExist().catch(() => false));

const property: PropertyInput = {
  kind: "single_family",
  name: null,
  addressLine1: "14 Ring Road",
  addressLine2: null,
  neighborhood: "Osu",
  locality: "Accra",
  region: "Greater Accra",
  postalCode: null,
  countryCode: "GH",
  latitude: "5.556000",
  longitude: "-0.183000",
};

const listingInput: ListingInput = {
  title: "Integration test house",
  priceMinor: 125_000_000,
  currency: "USD",
  highlights: ["New kitchen"],
  description: "One.\n\nTwo.",
  facts: { bedrooms: 3, bathrooms: 2.5, interiorArea: 2140, areaUnit: "sqft" },
  features: { interior: ["Gas range"] },
  hideAddress: false,
  galleryMode: null,
};

describe.skipIf(!ready)("listings and tours against the database", () => {
  const suffix = randomUUID().slice(0, 8);
  let tenantId: string;
  let otherTenantId: string;
  let tenant: TenantRecord;
  let userId: string;
  let listingId: string;
  let slug: string;
  const media: Record<string, string> = {};

  beforeAll(async () => {
    const [t] = await db()
      .insert(tenants)
      .values({ slug: `itest-listings-${suffix}`, name: "Listings Test Agency" })
      .returning();
    tenant = t;
    tenantId = t.id;
    const [other] = await db()
      .insert(tenants)
      .values({ slug: `itest-listings-other-${suffix}`, name: "Other Agency" })
      .returning({ id: tenants.id });
    otherTenantId = other.id;
    userId = `itest-owner-${suffix}`;
    await db().insert(users).values({ id: userId, email: `itest-owner-${suffix}@example.com`, name: "Ama Owner" });
    await db().insert(tenantMemberships).values({ tenantId, userId, role: "owner" });

    const add = async (key: string, kind: "panorama" | "photo" | "floor_plan", width: number, height: number, owner = tenantId) => {
      const [row] = await db()
        .insert(mediaAssets)
        .values({ tenantId: owner, cloudinaryPublicId: `itest/${suffix}/${key}`, kind, width, height, status: "ready" })
        .returning({ id: mediaAssets.id });
      media[key] = row.id;
    };
    await add("hall", "panorama", 6000, 3000);
    await add("kitchen", "panorama", 6000, 3000);
    await add("bedroom", "panorama", 6000, 3000);
    await add("photo1", "photo", 1600, 1067);
    await add("photo2", "photo", 1600, 1067);
    await add("plan", "floor_plan", 2000, 1400);
    await add("kitchenBefore", "panorama", 6000, 3000);
    await add("foreign", "panorama", 6000, 3000, otherTenantId);
  });

  afterAll(async () => {
    // Tenant cascade takes listings, properties, tours, photos, inquiries, views and media.
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
    if (otherTenantId) await db().delete(tenants).where(eq(tenants.id, otherTenantId));
    if (userId) await db().delete(users).where(eq(users.id, userId));
  });

  it("creates a listing with a readable slug and the default pinned actions", async () => {
    const result = await createListing({
      tenantId,
      userId,
      property,
      listing: listingInput,
      tourLinkLabels: { requestTour: "Request a tour", contactAgent: "Contact agent" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    listingId = result.data.id;
    slug = result.data.slug;
    expect(slug).toMatch(/^integration-test-house-[a-z2-9]{6}$/);
    const row = await findOwnedListing(tenantId, listingId);
    expect(row?.status).toBe("draft");
    expect(row?.tourLinks.map((link) => link.label)).toEqual(["Request a tour", "Contact agent"]);
  });

  it("keeps listings inside their tenant", async () => {
    expect(await findOwnedListing(otherTenantId, listingId)).toBeNull();
    expect(await getListingPage(otherTenantId, slug, { staffPreview: true })).toBeNull();
  });

  it("hides drafts from buyers and stamps publication and sale", async () => {
    expect(await getListingPage(tenantId, slug)).toBeNull();
    expect((await getListingPage(tenantId, slug, { staffPreview: true }))?.listing.title).toBe("Integration test house");
    await changeListingStatus(tenantId, listingId, "for_sale");
    const published = await findOwnedListing(tenantId, listingId);
    expect(published?.publishedAt).toBeInstanceOf(Date);
    await changeListingStatus(tenantId, listingId, "sold");
    expect((await findOwnedListing(tenantId, listingId))?.soldAt).toBeInstanceOf(Date);
    await changeListingStatus(tenantId, listingId, "for_sale");
    const back = await findOwnedListing(tenantId, listingId);
    expect(back?.soldAt).toBeNull();
    expect(back?.publishedAt?.getTime()).toBe(published?.publishedAt?.getTime());
  });

  it("attaches only this tenant's ready photos, in order, and reorders them", async () => {
    const result = await attachPhotos(tenantId, listingId, [media.photo1, media.foreign, media.photo2, media.hall]);
    expect(result).toEqual({ ok: true, data: { added: 2 } });
    const edit = await listingEditData(tenantId, listingId);
    const second = edit!.photos[1];
    await movePhoto(tenantId, listingId, second.id, "up");
    const after = await listingEditData(tenantId, listingId);
    expect(after!.photos.map((p) => p.mediaId)).toEqual([media.photo2, media.photo1]);
  });

  it("builds rooms from panoramas, connects them, and places arrows", async () => {
    const foreign = await createScenes(tenantId, listingId, [{ mediaId: media.foreign, filename: "x.jpg" }]);
    expect(foreign).toMatchObject({ ok: false, code: "NO_PANORAMAS" });
    const created = await createScenes(tenantId, listingId, [
      { mediaId: media.hall, filename: "hall.jpg" },
      { mediaId: media.kitchen, filename: "IMG_20260712_101530.jpg" },
      { mediaId: media.bedroom, filename: "main-bedroom.jpg" },
    ]);
    expect(created).toEqual({ ok: true, data: { created: 3 } });
    const data = await tourEditData(tenantId, listingId);
    const [hall, kitchen, bedroom] = data!.scenes;
    expect([hall.name, kitchen.name, bedroom.name]).toEqual(["Hall", "Room 2", "Main bedroom"]);
    expect(hall.isStart).toBe(true);

    expect(await addLink(tenantId, hall.id, kitchen.id, true)).toEqual({ ok: true, data: { created: 2 } });
    expect(await addLink(tenantId, hall.id, kitchen.id, true)).toEqual({ ok: true, data: { created: 0 } });
    expect(await addLink(tenantId, kitchen.id, bedroom.id, false)).toEqual({ ok: true, data: { created: 1 } });
    expect(await addLink(tenantId, hall.id, hall.id, false)).toMatchObject({ ok: false, code: "LINK_SELF" });

    const links = await db()
      .select()
      .from(sceneLinks)
      .where(and(eq(sceneLinks.tenantId, tenantId), eq(sceneLinks.fromSceneId, hall.id)));
    await updateLink(tenantId, links[0].id, { kind: "place", yaw: 0.3, pitch: -0.1 });
    await updateLink(tenantId, links[0].id, { kind: "rotate", delta: -15 });
    const [placed] = await db().select().from(sceneLinks).where(eq(sceneLinks.id, links[0].id));
    expect([placed.yaw, placed.pitch, placed.arrowRotation]).toEqual([expect.closeTo(0.3), expect.closeTo(-0.1), 345]);

    expect(
      await addHotspot(tenantId, hall.id, { yaw: 0, pitch: 0, title: "Range", content: null, externalUrl: "javascript:x", momentId: null }),
    ).toMatchObject({ ok: false, code: "HOTSPOT_URL" });
    expect((await addHotspot(tenantId, hall.id, { yaw: 0, pitch: 0, title: "Range", content: "Gas", externalUrl: null, momentId: null })).ok).toBe(true);

    await setStartScene(tenantId, kitchen.id);
    const starts = await db()
      .select({ id: tourScenes.id })
      .from(tourScenes)
      .where(and(eq(tourScenes.listingId, listingId), eq(tourScenes.isStart, true)));
    expect(starts.map((s) => s.id)).toEqual([kitchen.id]);

    const stats = (await tourEditData(tenantId, listingId))!.scenes.find((s) => s.id === bedroom.id)!.stats;
    expect(stats.isDeadEnd).toBe(true);
  });

  it("pins rooms on a floor and arranges the rest", async () => {
    const plan = await addFloorPlan(tenantId, listingId, media.plan, "Ground floor");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const data = await tourEditData(tenantId, listingId);
    const [hall, kitchen] = data!.scenes;
    await placeSceneOnPlan(tenantId, hall.id, plan.data.id, { x: 0.25, y: 0.5 });
    await placeSceneOnPlan(tenantId, kitchen.id, plan.data.id, null);
    expect(await autoArrangeFloor(tenantId, plan.data.id)).toEqual({ ok: true, data: { placed: 1 } });
    const after = await tourEditData(tenantId, listingId);
    const pinned = after!.scenes.filter((s) => s.floorPlanId === plan.data.id && s.mapX !== null);
    expect(pinned).toHaveLength(2);
    expect(after!.scenes.find((s) => s.id === hall.id)).toMatchObject({ mapX: 0.25, mapY: 0.5 });
    expect(after!.floorPlans[0]).toMatchObject({ label: "Ground floor", width: 1600, height: 1120 });
  });

  it("shows buyers only published rooms, and no arrow into a hidden one", async () => {
    const data = await tourEditData(tenantId, listingId);
    const [hall, kitchen] = data!.scenes;
    expect((await getListingPage(tenantId, slug))?.tour).toBeNull();
    expect(await setSceneStatuses(tenantId, listingId, [hall.id, kitchen.id], "published")).toEqual({
      ok: true,
      data: { changed: 2, unchanged: 0, skipped: 0 },
    });
    const page = await getListingPage(tenantId, slug);
    expect(page?.tour?.scenes.map((s) => s.name).sort()).toEqual(["Hall", "Room 2"]);
    const kitchenScene = page!.tour!.scenes.find((s) => s.id === kitchen.id)!;
    // The kitchen's link to the unpublished bedroom is gone; its unplaced link to the hall never existed.
    expect(kitchenScene.links).toEqual([]);
    expect(page?.tour?.startSceneId).toBe(kitchen.id);
    expect(page?.tour?.floorPlans?.map((p) => p.label)).toEqual(["Ground floor"]);
    expect(page?.photos).toHaveLength(2);
    expect(page?.agent?.name).toBe("Ama Owner");

    const cards = await listPublicListings(tenantId);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ slug, hasTour: true });
  });

  it("adds Before / After and shows the Before photo to buyers", async () => {
    const data = await tourEditData(tenantId, listingId);
    const kitchen = data!.scenes.find((s) => s.name === "Room 2")!;
    const added = await addMoment(tenantId, listingId, { label: "Before", baseLabel: "After", placement: "earlier" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const timeline = (await tourEditData(tenantId, listingId))!.moments;
    expect(timeline.map((m) => [m.label, m.isBase])).toEqual([
      ["Before", false],
      ["After", true],
    ]);
    const base = timeline.find((m) => m.isBase)!;

    expect(await setMomentPhoto(tenantId, kitchen.id, base.id, media.kitchenBefore)).toMatchObject({ ok: false, code: "MOMENT_BASE" });
    expect(await setMomentPhoto(tenantId, kitchen.id, added.data.id, media.photo1)).toMatchObject({ ok: false, code: "NO_PANORAMAS" });
    expect((await setMomentPhoto(tenantId, kitchen.id, added.data.id, media.kitchenBefore)).ok).toBe(true);
    await setMomentHeading(tenantId, kitchen.id, added.data.id, 200);

    const tour = (await getListingPage(tenantId, slug))!.tour!;
    expect(tour.timeline?.map((m) => m.label)).toEqual(["Before", "After"]);
    const kitchenScene = tour.scenes.find((s) => s.id === kitchen.id)!;
    expect(kitchenScene.moments).toEqual([
      expect.objectContaining({ momentId: added.data.id, headingOffsetDeg: -160, preview: expect.stringContaining("w_1600") }),
    ]);
    expect(kitchenScene.preview).toEqual(expect.stringContaining("w_1600"));

    // Hide people in the Before photo: the same bake, on the moment's row.
    const fakeCloudinary = (async (url: string | URL | Request) =>
      String(url).startsWith("https://res.cloudinary.com/")
        ? new Response(null, { status: 200 })
        : new Response(JSON.stringify({ public_id: "realestate-witus/x/before-private", width: 6000, height: 3000, bytes: 9 }), {
            status: 200,
          })) as unknown as typeof fetch;
    const privacyRecipe = { ...emptyPrivacyRecipe(), faces: "pixelate" as const };
    const edited = await applyPrivacyEdit({
      tenantId,
      sceneId: kitchen.id,
      momentId: added.data.id,
      currentMediaId: media.kitchenBefore,
      recipe: privacyRecipe,
      userId,
      fetchImpl: fakeCloudinary,
    });
    expect(edited.ok).toBe(true);
    const [beforeRow] = await db()
      .select()
      .from(sceneMomentPanoramas)
      .where(and(eq(sceneMomentPanoramas.sceneId, kitchen.id), eq(sceneMomentPanoramas.momentId, added.data.id)));
    expect(beforeRow).toMatchObject({ originalMediaId: media.kitchenBefore, privacyRecipe });
    expect(beforeRow.mediaId).not.toBe(media.kitchenBefore);
    // The room's current photo is untouched by a Before edit.
    expect((await db().select().from(tourScenes).where(eq(tourScenes.id, kitchen.id)))[0].originalPanoramaMediaId).toBeNull();
    // Replacing the Before photo drops the kept original: the new photo has no edits.
    await setMomentPhoto(tenantId, kitchen.id, added.data.id, media.kitchenBefore);
    const [replaced] = await db()
      .select()
      .from(sceneMomentPanoramas)
      .where(and(eq(sceneMomentPanoramas.sceneId, kitchen.id), eq(sceneMomentPanoramas.momentId, added.data.id)));
    expect(replaced).toMatchObject({ mediaId: media.kitchenBefore, originalMediaId: null, privacyRecipe: null });

    expect(await deleteMoment(tenantId, base.id)).toMatchObject({ ok: false, code: "MOMENT_BASE" });
    expect((await deleteMoment(tenantId, added.data.id)).ok).toBe(true);
    expect((await tourEditData(tenantId, listingId))!.moments).toEqual([]);
    expect((await getListingPage(tenantId, slug))!.tour!.timeline).toBeUndefined();
  });

  it("bakes a privacy edit into a new photo, keeps the original, and restores it", async () => {
    const data = await tourEditData(tenantId, listingId);
    const hall = data!.scenes.find((s) => s.name === "Hall")!;
    const [before] = await db().select().from(tourScenes).where(eq(tourScenes.id, hall.id));
    const original = before.panoramaMediaId;
    // Only Cloudinary is faked: the render is ready at once, and the upload echoes a new asset.
    const calls: string[] = [];
    const fakeCloudinary = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push(`${init?.method ?? "GET"} ${href}`);
      if (href.startsWith("https://res.cloudinary.com/")) return new Response(null, { status: 200 });
      return new Response(
        JSON.stringify({ public_id: `realestate-witus/${tenantId}/hall-private`, width: 6000, height: 3000, bytes: 1234 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const recipe = { ...emptyPrivacyRecipe(), faces: "blur" as const, boxes: [{ id: "a", u: 0.5, v: 0.5, w: 0.1, h: 0.2 }] };

    const stale = await applyPrivacyEdit({ tenantId, sceneId: hall.id, currentMediaId: media.kitchen, recipe, userId, fetchImpl: fakeCloudinary });
    expect(stale).toMatchObject({ ok: false, code: "PRIVACY_STALE" });

    const applied = await applyPrivacyEdit({ tenantId, sceneId: hall.id, currentMediaId: original, recipe, userId, fetchImpl: fakeCloudinary });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    // The render was built from the original, in its pixels, faces first.
    expect(calls[0]).toMatch(/^HEAD https:\/\/res\.cloudinary\.com\/.*\/e_blur_faces:1500\/e_pixelate_region:40,x_2700,y_1200,w_600,h_600\/q_90\/itest\//);
    const [after] = await db().select().from(tourScenes).where(eq(tourScenes.id, hall.id));
    expect(after).toMatchObject({ panoramaMediaId: applied.data.mediaId, originalPanoramaMediaId: original, privacyRecipe: recipe });

    // A second edit starts again from the original, not from the edited copy.
    calls.length = 0;
    const again = await applyPrivacyEdit({
      tenantId,
      sceneId: hall.id,
      currentMediaId: applied.data.mediaId,
      recipe: { ...recipe, faces: "off" },
      userId,
      fetchImpl: fakeCloudinary,
    });
    expect(again.ok).toBe(true);
    expect(calls[0]).toContain(`/q_90/itest/${suffix}/hall`);
    expect((await db().select().from(tourScenes).where(eq(tourScenes.id, hall.id)))[0].originalPanoramaMediaId).toBe(original);

    // An empty recipe restores the original.
    const current = (await db().select().from(tourScenes).where(eq(tourScenes.id, hall.id)))[0].panoramaMediaId;
    expect((await applyPrivacyEdit({ tenantId, sceneId: hall.id, currentMediaId: current, recipe: emptyPrivacyRecipe(), userId })).ok).toBe(true);
    const [restored] = await db().select().from(tourScenes).where(eq(tourScenes.id, hall.id));
    expect(restored).toMatchObject({ panoramaMediaId: original, originalPanoramaMediaId: null, privacyRecipe: null });
  });

  it("counts views per day and surface", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await recordListingView({ tenantId, listingId, surface: "page", event: "page", day });
    await recordListingView({ tenantId, listingId, surface: "page", event: "page", day });
    await recordListingView({ tenantId, listingId, surface: "page", event: "tour", day });
    await recordListingView({ tenantId, listingId, surface: "embed", event: "page", day });
    const edit = await listingEditData(tenantId, listingId);
    expect(edit!.views30d).toEqual({ page: { pageViews: 2, tourOpens: 1 }, embed: { pageViews: 1, tourOpens: 0 } });
    const board = await listingsBoard(tenantId);
    expect(board[0]).toMatchObject({ pageViews7d: 3, tourOpens7d: 1, scenes: 3, publishedScenes: 2 });
  });

  it("saves an inquiry, and quietly drops a bot's", async () => {
    const raw = {
      kind: "tour_request",
      source: "tour",
      surface: "page",
      name: "Kofi Buyer",
      email: "kofi@example.com",
      message: "Saturday?",
      startedAt: Date.now() - 60_000,
    };
    expect(await submitInquiry({ tenant, slug, raw, origin: "https://homes.example.com" })).toEqual({
      ok: true,
      data: { saved: true },
    });
    expect(await submitInquiry({ tenant, slug, raw: { ...raw, website: "spam" }, origin: "https://x" })).toEqual({
      ok: true,
      data: { saved: false },
    });
    const rows = await db().select().from(listingInquiries).where(eq(listingInquiries.listingId, listingId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "tour_request", source: "tour", email: "kofi@example.com", status: "new" });
    expect((await listingsBoard(tenantId))[0].newInquiries).toBe(1);
  });

  it("offers only this agency's team as agents", async () => {
    expect((await assignableAgents(tenant)).map((agent) => agent.id)).toEqual([userId]);
    expect(await assignableAgents({ id: otherTenantId, flags: {} })).toEqual([]);
  });

  it("routes a platform-tenant listing's inquiries to a platform owner, and only there", async () => {
    // Compared with whoever is platform owner in this database; never creates one.
    const owners = await db()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.isPlatformOwner, true))
      .orderBy(users.createdAt)
      .limit(1);
    const fallback = await loadAgent(otherTenantId, null, { platformTenant: true });
    expect(fallback?.email ?? null).toBe(owners[0]?.email ?? null);
    // An agency with no owner never falls back to the platform owner.
    expect(await loadAgent(otherTenantId, null)).toBeNull();
    // An agency's assigned agent who isn't on its team is ignored.
    expect((await loadAgent(otherTenantId, userId))?.email ?? null).toBeNull();
  });

  it("refuses a slug from another tenant's host", async () => {
    const otherTenant = { ...tenant, id: otherTenantId };
    expect(await submitInquiry({ tenant: otherTenant, slug, raw: {}, origin: "https://x" })).toMatchObject({
      ok: false,
      code: "LISTING_NOT_FOUND",
    });
  });

  it("leaves no orphans when a listing is deleted", async () => {
    await db().delete(listings).where(eq(listings.id, listingId));
    const scenes = await db().select().from(tourScenes).where(eq(tourScenes.listingId, listingId));
    const photos = await db().select().from(listingPhotos).where(eq(listingPhotos.listingId, listingId));
    expect([scenes.length, photos.length]).toEqual([0, 0]);
  });
});
