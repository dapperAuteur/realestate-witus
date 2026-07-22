"use server";

import { redirect } from "next/navigation";
import { createBlockout, releaseBlockout } from "@/lib/admin/blockouts";
import {
  createAttraction,
  deleteAttraction,
  updateAttraction,
  upsertSiteSection,
  type AttractionInput,
} from "@/lib/admin/content";
import { createStaffInvite, revokeStaffInvite } from "@/lib/admin/invites";
import { updateTenantDesign } from "@/lib/admin/design";
import { getStaffContext, type StaffContext } from "@/lib/admin/guard";
import { createRateOverride, deleteRateOverride } from "@/lib/admin/pricing";
import {
  transitionReservation,
  type ReservationAction,
} from "@/lib/admin/reservations";
import { addDays } from "@/lib/booking/dates";
import { headers } from "next/headers";
import { SECTION_KEYS } from "@/lib/sections";
import {
  createAnnouncement,
  sendAnnouncement,
  setAnnouncementPublished,
  type Audience,
} from "@/lib/campaigns";
import { localToday } from "@/lib/admin/today";
import { upsertHotelSettings, type HotelSettingsInput } from "@/lib/admin/settings";
import { claimMomoInvoice } from "@/lib/platform/billing";
import { addMessage, confirmResolution, createThread } from "@/lib/support";
import { setInquiryStatus, type InquiryStatus } from "@/lib/venue";
import { sendToOutbox } from "@/lib/witus-outbox";
import { writeAudit } from "@/lib/audit";
import {
  addUnit,
  createRoomType,
  deleteUnitIfClean,
  removeRoomPhoto,
  setUnitActive,
  updateRoomType,
} from "@/lib/rooms";
import {
  cancelRsvp,
  createEvent,
  deleteEvent,
  updateEvent,
  type EventInput,
  type EventKind,
} from "@/lib/events";
import {
  issueEditToken,
  setPartnerStatus,
  type PartnerStatusAction,
} from "@/lib/partners";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import type { TenantRole } from "@/db/schema";

// Every action re-guards independently of the page (a stale tab must not
// outlive a revoked membership) and reports back via ?ok/?error redirect
// flags rendered with role=status/alert.

async function guardOr403(min: TenantRole, lang: string): Promise<StaffContext> {
  const gate = await getStaffContext(min);
  if (!gate.ok) redirect(`/${lang}/sign-in`);
  return gate.ctx;
}

function backTo(path: string, flag: "ok" | "error", value: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${flag}=${encodeURIComponent(value)}`);
}

export async function reservationAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/reservations`);
  const ctx = await guardOr403("front_desk", lang);
  const reservationId = String(formData.get("reservationId") ?? "");
  const action = String(formData.get("action") ?? "") as ReservationAction;
  const result = await transitionReservation(ctx.tenant.id, reservationId, action);
  if (!result.ok) backTo(back, "error", result.code);
  await writeAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.user.id,
    kind: "booking.transition",
    summary: `Reservation ${action.replace("_", " ")} → ${result.data.status}`,
    data: { reservationId, action },
  });
  backTo(back, "ok", "1");
}

export async function blockUnitAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/calendar`);
  const ctx = await guardOr403("front_desk", lang);
  const date = String(formData.get("date") ?? "");
  const result = await createBlockout({
    tenantId: ctx.tenant.id,
    unitId: String(formData.get("unitId") ?? ""),
    startDate: date,
    endDate: addDays(date, 1),
    reason: String(formData.get("reason") ?? "") || undefined,
    createdBy: ctx.user.id,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function unblockUnitAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/calendar`);
  const ctx = await guardOr403("front_desk", lang);
  const result = await releaseBlockout(
    ctx.tenant.id,
    String(formData.get("claimId") ?? ""),
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function createOverrideAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/pricing`);
  const ctx = await guardOr403("manager", lang);

  let dowMask = 0;
  for (let bit = 0; bit < 7; bit++) {
    if (formData.get(`dow${bit}`)) dowMask |= 1 << bit;
  }
  const result = await createRateOverride({
    tenantId: ctx.tenant.id,
    roomTypeId: String(formData.get("roomTypeId") ?? ""),
    label: String(formData.get("label") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    rateMinor: Number(formData.get("rateMinor") ?? NaN),
    priority: Number(formData.get("priority") ?? 0),
    dowMask: dowMask === 0 ? null : dowMask,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function deleteOverrideAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/pricing`);
  const ctx = await guardOr403("manager", lang);
  await deleteRateOverride(ctx.tenant.id, String(formData.get("overrideId") ?? ""));
  backTo(back, "ok", "1");
}

export async function saveDesignAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/design`;
  const ctx = await guardOr403("manager", lang);

  const positions: { key: string; pos: number }[] = [];
  const hidden: string[] = [];
  const variants: Record<string, string> = {};
  for (const key of SECTION_KEYS) {
    positions.push({ key, pos: Number(formData.get(`order_${key}`) ?? 99) });
    if (key !== "hero" && !formData.get(`visible_${key}`)) hidden.push(key);
    const variant = formData.get(`variant_${key}`);
    if (variant) variants[key] = String(variant);
  }
  positions.sort((a, b) => a.pos - b.pos);

  const result = await updateTenantDesign(ctx.tenant.id, {
    templateKey: String(formData.get("templateKey") ?? ""),
    presetKey: String(formData.get("presetKey") ?? ""),
    fontPairKey: String(formData.get("fontPairKey") ?? ""),
    sectionOrder: positions.map((p) => p.key),
    sectionHidden: hidden,
    sectionVariants: variants,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

export async function inviteStaffAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/team`);
  const ctx = await guardOr403("owner", lang);
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const result = await createStaffInvite({
    tenantId: ctx.tenant.id,
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "front_desk") as never,
    invitedBy: ctx.user.id,
    acceptUrlBase: `${proto}://${host}/${lang}/invite`,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/team`);
  const ctx = await guardOr403("owner", lang);
  await revokeStaffInvite(ctx.tenant.id, String(formData.get("inviteId") ?? ""));
  backTo(back, "ok", "1");
}

export async function saveSectionAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/content`;
  const ctx = await guardOr403("manager", lang);
  const result = await upsertSiteSection({
    tenantId: ctx.tenant.id,
    key: String(formData.get("key") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    isPublished: Boolean(formData.get("isPublished")),
    data: {
      imageUrl: String(formData.get("imageUrl") ?? ""),
      imageAlt: String(formData.get("imageAlt") ?? ""),
      embedUrl: String(formData.get("embedUrl") ?? ""),
    },
    updatedBy: ctx.user.id,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

function attractionInput(formData: FormData): AttractionInput {
  const num = (name: string) => {
    const v = Number(formData.get(name));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };
  return {
    name: String(formData.get("name") ?? ""),
    zone: String(formData.get("zone") ?? "walkable") as AttractionInput["zone"],
    category: String(
      formData.get("category") ?? "other",
    ) as AttractionInput["category"],
    walkMinutes: num("walkMinutes"),
    driveMinutes: num("driveMinutes"),
    blurb: String(formData.get("blurb") ?? ""),
    mapUrl: String(formData.get("mapUrl") ?? ""),
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    isPublished: Boolean(formData.get("isPublished")),
  };
}

export async function createAttractionAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/guide`;
  const ctx = await guardOr403("manager", lang);
  const result = await createAttraction(ctx.tenant.id, attractionInput(formData));
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function updateAttractionAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/guide`;
  const ctx = await guardOr403("manager", lang);
  const result = await updateAttraction(
    ctx.tenant.id,
    String(formData.get("id") ?? ""),
    attractionInput(formData),
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function deleteAttractionAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/guide`;
  const ctx = await guardOr403("manager", lang);
  await deleteAttraction(ctx.tenant.id, String(formData.get("id") ?? ""));
  backTo(back, "ok", "1");
}

export async function createAnnouncementAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/announce`;
  const ctx = await guardOr403("manager", lang);
  const result = await createAnnouncement({
    tenantId: ctx.tenant.id,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    urgency: formData.get("urgency") === "urgent" ? "urgent" : "normal",
    audience: String(formData.get("audience") ?? "past_guests") as Audience,
    createdBy: ctx.user.id,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function publishAnnouncementAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/announce`;
  const ctx = await guardOr403("manager", lang);
  const announcementId = String(formData.get("announcementId") ?? "");
  const publish = formData.get("publish") === "1";
  const result = await setAnnouncementPublished(ctx.tenant.id, announcementId, publish);
  if (!result.ok) backTo(back, "error", result.code);
  if (publish) {
    // Social-draft moment for BAM's outbox (double-gated; best-effort).
    await sendToOutbox("announcement.published", {
      tenantId: ctx.tenant.id,
      announcementId,
    });
  }
  backTo(back, "ok", "1");
}

export async function sendAnnouncementAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/announce`;
  const ctx = await guardOr403("manager", lang);
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const result = await sendAnnouncement({
    tenantId: ctx.tenant.id,
    announcementId: String(formData.get("announcementId") ?? ""),
    today: localToday("Africa/Accra"),
    from: ctx.tenant.email.from,
    replyTo: ctx.tenant.email.replyTo,
    siteBase: `${proto}://${host}`,
    brandName: ctx.tenant.theme.name ?? ctx.tenant.name,
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", `sent:${result.data.sent}`);
}

export async function createPromoAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/pricing`);
  const ctx = await guardOr403("manager", lang);
  const code = String(formData.get("code") ?? "").trim();
  const kind = formData.get("kind") === "fixed" ? "fixed" : "percent";
  const value = Number(formData.get("value") ?? NaN);
  if (!/^[a-zA-Z0-9-]{3,24}$/.test(code)) backTo(back, "error", "PROMO_BAD_CODE");
  if (!Number.isInteger(value) || value <= 0 || (kind === "percent" && value > 90)) {
    backTo(back, "error", "PROMO_BAD_VALUE");
  }
  const max = Number(formData.get("maxRedemptions") ?? 0);
  try {
    await db().insert(promoCodes).values({
      tenantId: ctx.tenant.id,
      code,
      kind,
      value,
      roomTypeId: String(formData.get("roomTypeId") ?? "") || null,
      startsOn: String(formData.get("startsOn") ?? "") || null,
      endsOn: String(formData.get("endsOn") ?? "") || null,
      maxRedemptions: Number.isInteger(max) && max > 0 ? max : null,
    });
  } catch {
    backTo(back, "error", "PROMO_EXISTS");
  }
  backTo(back, "ok", "1");
}

export async function togglePromoAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/admin/pricing`);
  const ctx = await guardOr403("manager", lang);
  await db()
    .update(promoCodes)
    .set({ isActive: formData.get("active") === "1" })
    .where(
      and(
        eq(promoCodes.id, String(formData.get("promoId") ?? "")),
        eq(promoCodes.tenantId, ctx.tenant.id),
      ),
    );
  backTo(back, "ok", "1");
}

export async function partnerStatusAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/partners`;
  const ctx = await guardOr403("manager", lang);
  const partnerId = String(formData.get("partnerId") ?? "");
  const statusAction = String(formData.get("statusAction") ?? "") as PartnerStatusAction;
  const result = await setPartnerStatus(ctx.tenant.id, partnerId, statusAction);
  if (!result.ok) backTo(back, "error", result.code);
  await writeAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.user.id,
    kind: "partner.status",
    summary: `Partner ${statusAction} → ${result.data.status}`,
    data: { partnerId },
  });
  backTo(back, "ok", "1");
}

export async function issueEditLinkAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/partners`;
  const ctx = await guardOr403("manager", lang);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  const result = await issueEditToken(
    ctx.tenant.id,
    String(formData.get("partnerId") ?? ""),
    `${proto}://${host}`,
    lang,
  );
  if (!result.ok) backTo(back, "error", result.code);
  redirect(`${back}?link=${encodeURIComponent(result.data.url)}`);
}

function eventInput(formData: FormData): EventInput {
  const cap = Number(formData.get("capacity"));
  return {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    kind: String(formData.get("kind") ?? "hotel") as EventKind,
    // datetime-local carries no zone; Accra is UTC year-round so the wall
    // clock the owner typed IS the instant.
    startsAt: new Date(`${String(formData.get("startsAt") ?? "")}:00Z`),
    locationText: String(formData.get("locationText") ?? ""),
    capacity: Number.isInteger(cap) && cap > 0 ? cap : null,
    rsvpMode: formData.get("rsvp") ? "free_rsvp" : "none",
    isPublished: Boolean(formData.get("isPublished")),
  };
}

export async function createEventAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/events`;
  const ctx = await guardOr403("manager", lang);
  const result = await createEvent(ctx.tenant.id, eventInput(formData));
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function updateEventAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/events`;
  const ctx = await guardOr403("manager", lang);
  const result = await updateEvent(
    ctx.tenant.id,
    String(formData.get("eventId") ?? ""),
    eventInput(formData),
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/events`;
  const ctx = await guardOr403("manager", lang);
  await deleteEvent(ctx.tenant.id, String(formData.get("eventId") ?? ""));
  backTo(back, "ok", "1");
}

export async function cancelRsvpAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/events`;
  const ctx = await guardOr403("front_desk", lang);
  const result = await cancelRsvp(ctx.tenant.id, String(formData.get("rsvpId") ?? ""));
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/settings`;
  const ctx = await guardOr403("manager", lang);
  const optionalInt = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? null : Number(raw);
  };
  const input: HotelSettingsInput = {
    hotelName: String(formData.get("hotelName") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    whatsappE164: String(formData.get("whatsappE164") ?? ""),
    whatsappGroupUrl: String(formData.get("whatsappGroupUrl") ?? ""),
    email: String(formData.get("email") ?? ""),
    checkinTime: String(formData.get("checkinTime") ?? ""),
    checkoutTime: String(formData.get("checkoutTime") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    bookingMode: String(
      formData.get("bookingMode") ?? "instant_deposit",
    ) as HotelSettingsInput["bookingMode"],
    depositPercent: Number(formData.get("depositPercent") ?? NaN),
    holdMinutes: Number(formData.get("holdMinutes") ?? NaN),
    cancellationFreeUntilDays: optionalInt("cancellationFreeUntilDays"),
    cancellationPenaltyPercent: optionalInt("cancellationPenaltyPercent"),
  };
  const result = await upsertHotelSettings(ctx.tenant.id, input);
  if (!result.ok) backTo(back, "error", result.code);
  await writeAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.user.id,
    kind: "admin.settings.update",
    summary: "Hotel settings updated",
    data: { bookingMode: input.bookingMode, depositPercent: input.depositPercent },
  });
  backTo(back, "ok", "1");
}

export async function updateRoomTypeAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/rooms`;
  const ctx = await guardOr403("manager", lang);
  const size = Number(formData.get("sizeSqm"));
  const result = await updateRoomType(
    ctx.tenant.id,
    String(formData.get("roomTypeId") ?? ""),
    {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      baseRateMinor: Number(formData.get("baseRateMinor") ?? NaN),
      maxOccupancy: Number(formData.get("maxOccupancy") ?? NaN),
      bedConfig: String(formData.get("bedConfig") ?? ""),
      sizeSqm: Number.isInteger(size) && size > 0 ? size : null,
      sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
      isActive: Boolean(formData.get("isActive")),
    },
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function removeRoomPhotoAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/rooms`;
  const ctx = await guardOr403("manager", lang);
  await removeRoomPhoto(ctx.tenant.id, String(formData.get("photoId") ?? ""));
  backTo(back, "ok", "1");
}

function roomTypeInput(formData: FormData) {
  const size = Number(formData.get("sizeSqm"));
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    baseRateMinor: Number(formData.get("baseRateMinor") ?? NaN),
    maxOccupancy: Number(formData.get("maxOccupancy") ?? NaN),
    bedConfig: String(formData.get("bedConfig") ?? ""),
    sizeSqm: Number.isInteger(size) && size > 0 ? size : null,
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    isActive: Boolean(formData.get("isActive")),
  };
}

export async function createRoomTypeAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/rooms`;
  const ctx = await guardOr403("manager", lang);
  const result = await createRoomType(ctx.tenant.id, roomTypeInput(formData));
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function addUnitAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/rooms`;
  const ctx = await guardOr403("manager", lang);
  const result = await addUnit(
    ctx.tenant.id,
    String(formData.get("roomTypeId") ?? ""),
    String(formData.get("unitNumber") ?? ""),
    String(formData.get("floor") ?? ""),
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function toggleUnitAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/rooms`;
  const ctx = await guardOr403("manager", lang);
  const result = await setUnitActive(
    ctx.tenant.id,
    String(formData.get("unitId") ?? ""),
    formData.get("active") === "1",
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function deleteUnitAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/rooms`;
  const ctx = await guardOr403("manager", lang);
  const result = await deleteUnitIfClean(
    ctx.tenant.id,
    String(formData.get("unitId") ?? ""),
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function claimInvoiceAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/billing`;
  const ctx = await guardOr403("owner", lang);
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await claimMomoInvoice(ctx.tenant.id, invoiceId);
  await writeAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.user.id,
    kind: "billing.invoice.claimed",
    summary: "MoMo payment claimed by owner",
    data: { invoiceId },
  });
  backTo(back, "ok", "1");
}

export async function createThreadAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/support`;
  const ctx = await guardOr403("front_desk", lang);
  const result = await createThread({
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    subject: String(formData.get("subject") ?? ""),
    category: String(formData.get("category") ?? "question") as Parameters<
      typeof createThread
    >[0]["category"],
    body: String(formData.get("body") ?? ""),
    recordingUrl: String(formData.get("recordingUrl") ?? "") || undefined,
    screenshotMediaId: String(formData.get("screenshotMediaId") ?? "") || undefined,
  });
  if (!result.ok) backTo(back, "error", result.code);
  redirect(`${back}/${result.data.threadId}`);
}

export async function replyThreadAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  const back = `/${lang}/admin/support/${threadId}`;
  const ctx = await guardOr403("front_desk", lang);
  const result = await addMessage({
    threadId,
    authorId: ctx.user.id,
    authorRole: "user",
    body: String(formData.get("body") ?? ""),
  });
  if (!result.ok) backTo(back, "error", result.code);
  redirect(back);
}

export async function confirmResolutionAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const threadId = String(formData.get("threadId") ?? "");
  const back = `/${lang}/admin/support/${threadId}`;
  const ctx = await guardOr403("front_desk", lang);
  const result = await confirmResolution({
    threadId,
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    confirmed: Boolean(formData.get("confirmed")),
    disputeReason: String(formData.get("disputeReason") ?? "") || undefined,
  });
  if (!result.ok) backTo(back, "error", result.code);
  redirect(back);
}

export async function setInquiryStatusAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = `/${lang}/admin/events`;
  const ctx = await guardOr403("manager", lang);
  const result = await setInquiryStatus(
    ctx.tenant.id,
    String(formData.get("inquiryId") ?? ""),
    String(formData.get("status") ?? "") as InquiryStatus,
  );
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}
