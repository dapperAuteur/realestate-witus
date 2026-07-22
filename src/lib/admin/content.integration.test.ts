// Content lib against Neon (skips without a DB URL): section upsert +
// publish gating on the public homepage query path, attractions CRUD.
// Throwaway tenant, cascade-deleted.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { siteSections, tenants } from "@/db/schema";
import {
  createAttraction,
  deleteAttraction,
  listAttractions,
  updateAttraction,
  upsertSiteSection,
} from "./content";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("content lib against Neon", () => {
  let tenantId: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({ slug: `itest-cms-${randomUUID().slice(0, 8)}`, name: "CMS Test Hotel" })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("upserts a section twice (insert then update), draft by default", async () => {
    const first = await upsertSiteSection({
      tenantId,
      key: "about",
      title: "About us",
      body: "First draft.",
      isPublished: false,
      data: {},
    });
    expect(first.ok).toBe(true);

    const second = await upsertSiteSection({
      tenantId,
      key: "about",
      title: "About us",
      body: "Final copy.",
      isPublished: true,
      data: {},
    });
    expect(second.ok).toBe(true);

    const [row] = await db()
      .select()
      .from(siteSections)
      .where(and(eq(siteSections.tenantId, tenantId), eq(siteSections.key, "about")));
    expect(row.body).toBe("Final copy.");
    expect(row.isPublished).toBe(true);
  });

  it("rejects unknown keys and non-https links", async () => {
    expect(
      await upsertSiteSection({
        tenantId,
        key: "casino",
        title: "",
        body: "",
        isPublished: false,
        data: {},
      }),
    ).toMatchObject({ ok: false, code: "UNKNOWN_SECTION" });
    expect(
      await upsertSiteSection({
        tenantId,
        key: "hero",
        title: "",
        body: "",
        isPublished: false,
        data: { imageUrl: "http://insecure.example.com/x.jpg" },
      }),
    ).toMatchObject({ ok: false, code: "INVALID_URL" });
  });

  it("attractions: create, update, delete round trip with validation", async () => {
    const bad = await createAttraction(tenantId, {
      name: "  ",
      zone: "walkable",
      category: "beach",
      walkMinutes: 10,
      driveMinutes: null,
      blurb: "",
      mapUrl: "",
      sortOrder: 0,
      isPublished: true,
    });
    expect(bad).toMatchObject({ ok: false, code: "INVALID_NAME" });

    const created = await createAttraction(tenantId, {
      name: "Labadi Beach",
      zone: "walkable",
      category: "beach",
      walkMinutes: 12,
      driveMinutes: null,
      blurb: "Bring cedis for a lounger.",
      mapUrl: "https://maps.example.com/labadi",
      sortOrder: 1,
      isPublished: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateAttraction(tenantId, created.data.id, {
      name: "Labadi Beach",
      zone: "day_trip",
      category: "beach",
      walkMinutes: null,
      driveMinutes: 25,
      blurb: "Bring cedis for a lounger.",
      mapUrl: "",
      sortOrder: 2,
      isPublished: false,
    });
    expect(updated.ok).toBe(true);

    const rows = await listAttractions(tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ zone: "day_trip", driveMinutes: 25, isPublished: false });

    const deleted = await deleteAttraction(tenantId, created.data.id);
    expect(deleted).toMatchObject({ ok: true, data: { deleted: true } });
    expect(await listAttractions(tenantId)).toHaveLength(0);
  });
});
