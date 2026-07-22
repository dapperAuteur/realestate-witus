// Partner lifecycle against Neon (skips without a DB URL): apply → approve →
// self-edit by token → suspend revokes the token. Throwaway tenant,
// cascade-deleted in afterAll. Emails dev-log (Mailgun stripped in tests).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { partners, tenants } from "@/db/schema";
import {
  getPartnerByToken,
  issueEditToken,
  listPartnersAdmin,
  setPartnerStatus,
  submitPartnerApplication,
  updatePartnerProfile,
} from "./partners";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

describe.skipIf(!hasDb)("partner lifecycle against Neon", () => {
  let tenantId: string;
  let partnerId: string;
  let editUrl: string;

  beforeAll(async () => {
    const [tenant] = await db()
      .insert(tenants)
      .values({
        slug: `itest-partner-${randomUUID().slice(0, 8)}`,
        name: "Partner Test Hotel",
        flags: { concierge: true },
      })
      .returning({ id: tenants.id });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await db().delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("application validates and lands as applied", async () => {
    expect(
      await submitPartnerApplication(tenantId, {
        name: "No Contact",
        category: "driver",
        blurb: "",
        consent: true,
      }),
    ).toMatchObject({ ok: false, code: "NO_CONTACT" });
    expect(
      await submitPartnerApplication(tenantId, {
        name: "Bad WhatsApp",
        category: "driver",
        blurb: "",
        whatsappE164: "0244123456",
        consent: true,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_WHATSAPP" });

    const applied = await submitPartnerApplication(tenantId, {
      name: "Kofi Test Rides",
      category: "driver",
      blurb: "Test blurb.",
      whatsappE164: "+233200000009",
      email: "kofi-test@example.com",
      consent: true,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    partnerId = applied.data.id;

    const list = await listPartnersAdmin(tenantId);
    expect(list[0]).toMatchObject({ id: partnerId, status: "applied" });
    expect(list[0].consentAt).not.toBeNull();
  });

  it("edit links only exist for approved partners; token round-trips", async () => {
    expect(
      await issueEditToken(tenantId, partnerId, "https://test.local", "en"),
    ).toMatchObject({ ok: false, code: "NOT_APPROVED" });

    expect(await setPartnerStatus(tenantId, partnerId, "approve")).toMatchObject({
      ok: true,
      data: { status: "approved" },
    });
    const issued = await issueEditToken(tenantId, partnerId, "https://test.local", "en");
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    editUrl = issued.data.url;

    const token = editUrl.split("/").pop() as string;
    expect(await getPartnerByToken(tenantId, token)).not.toBeNull();
    // Wrong tenant sees nothing.
    expect(await getPartnerByToken(randomUUID(), token)).toBeNull();

    const updated = await updatePartnerProfile(tenantId, token, {
      blurb: "Updated by the partner.",
      whatsappE164: "+233200000010",
      priceNote: "from GHS 150",
    });
    expect(updated.ok).toBe(true);
    const [row] = await db()
      .select({ blurb: partners.blurb, whatsapp: partners.whatsappE164 })
      .from(partners)
      .where(eq(partners.id, partnerId));
    expect(row).toEqual({
      blurb: "Updated by the partner.",
      whatsapp: "+233200000010",
    });
  });

  it("suspension revokes outstanding tokens immediately", async () => {
    const token = editUrl.split("/").pop() as string;
    expect(await setPartnerStatus(tenantId, partnerId, "suspend")).toMatchObject({
      ok: true,
      data: { status: "suspended" },
    });
    expect(await getPartnerByToken(tenantId, token)).toBeNull();
    expect(
      await updatePartnerProfile(tenantId, token, { blurb: "should fail" }),
    ).toMatchObject({ ok: false, code: "TOKEN_INVALID" });
  });
});
