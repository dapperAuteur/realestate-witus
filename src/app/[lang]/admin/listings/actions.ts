"use server";

import { redirect } from "next/navigation";
import type { TenantRole } from "@/db/schema";
import { getStaffContext, type StaffContext } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/audit";
import { getDictionary, hasLocale, type Locale } from "@/lib/dictionaries";
import {
  assignableAgents,
  attachPhotos,
  canEditListing,
  changeListingStatus,
  createListing,
  findOwnedListing,
  listingIdForInquiry,
  listingIdForPhoto,
  movePhoto,
  removePhoto,
  setInquiryStatus,
  setPhotoAlt,
  updateListing,
} from "@/lib/listings/admin";
import { parseListingInput, parsePropertyInput, parseStatus } from "@/lib/listings/listing-input";
import { err, type Result } from "@/lib/result";
import {
  addFloorPlan,
  addHotspot,
  addLink,
  addMoment,
  deleteMoment,
  listingIdForMoment,
  removeMomentPhoto,
  renameMoment,
  setMomentHeading,
  setMomentPhoto,
  autoArrangeFloor,
  createScenes,
  deleteFloorPlan,
  deleteHotspot,
  deleteLink,
  deleteScene,
  listingIdForFloorPlan,
  listingIdForHotspot,
  listingIdForLink,
  listingIdForScene,
  placeSceneOnPlan,
  renameFloorPlan,
  setSceneStatuses,
  setStartScene,
  updateHotspot,
  updateLink,
  updateScene,
  type HotspotInput,
} from "@/lib/tour/admin";
import { CSV_MAX_CHARS, CSV_MAX_ROOMS } from "@/lib/tour/csv-import";
import { importTourCsv, type TourImportResult } from "@/lib/tour/import";
import { applyPrivacyEdit } from "@/lib/tour/privacy";
import { parsePrivacyRecipe } from "@/lib/tour/privacy-edit";
import { parsePlanPoint, parsePosition, parseRoll, parseViewLimit } from "@/lib/tour/tour-input";

// Listing and tour actions (plans/08 phase D). Every action re-guards on its
// own: a stale tab must not outlive a revoked membership. Edit rights are
// checked on the listing an entity really belongs to (resolved server-side),
// never on an id the request claims.

const FORBIDDEN = err("FORBIDDEN", "You can't change that listing.");

async function staff(min: TenantRole = "agent"): Promise<StaffContext | null> {
  const gate = await getStaffContext(min);
  return gate.ok ? gate.ctx : null;
}

/** The staff context, if this user may edit this listing. */
async function editor(listingId: string | null): Promise<{ ctx: StaffContext; listingId: string } | null> {
  if (!listingId) return null;
  const ctx = await staff("agent");
  if (!ctx) return null;
  const listing = await findOwnedListing(ctx.tenant.id, listingId);
  if (!listing || !canEditListing({ role: ctx.role, userId: ctx.user.id }, listing)) return null;
  return { ctx, listingId };
}

function langOf(formData: FormData): Locale {
  const lang = String(formData.get("lang") ?? "en");
  return hasLocale(lang) ? lang : "en";
}

function backTo(path: string, flag: "ok" | "error", value: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${flag}=${encodeURIComponent(value)}`);
}

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

// ── Listings ─────────────────────────────────────────────────────────────────

export async function createListingAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const back = `/${lang}/admin/listings/new`;
  const ctx = await staff("manager");
  if (!ctx) backTo(back, "error", "FORBIDDEN");
  const property = parsePropertyInput(formData);
  if (!property.ok) backTo(back, "error", property.code);
  const listing = parseListingInput(formData);
  if (!listing.ok) backTo(back, "error", listing.code);
  const dict = await getDictionary(lang);
  const created = await createListing({
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    property: property.data,
    listing: listing.data,
    tourLinkLabels: dict.tour.defaultLinks,
  });
  if (!created.ok) backTo(back, "error", created.code);
  await writeAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.user.id,
    kind: "listing.created",
    summary: `Listing created: ${listing.data.title}`,
    data: { listingId: created.data.id },
  }).catch(() => undefined);
  redirect(`/${lang}/admin/listings/${created.data.id}?ok=created`);
}

export async function saveListingAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const listingId = str(formData, "listingId");
  const back = `/${lang}/admin/listings/${listingId}`;
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const property = parsePropertyInput(formData);
  if (!property.ok) backTo(back, "error", property.code);
  const listing = parseListingInput(formData);
  if (!listing.ok) backTo(back, "error", listing.code);
  // Only owners and managers reassign a listing; an agent's form has no agent field.
  const agentRaw = formData.get("agentUserId");
  const canAssign = gate.ctx.role === "owner" || gate.ctx.role === "manager";
  const agentUserId = canAssign && typeof agentRaw === "string" ? agentRaw || null : undefined;
  if (agentUserId) {
    const allowed = await assignableAgents(gate.ctx.tenant);
    if (!allowed.some((agent) => agent.id === agentUserId)) backTo(back, "error", "BAD_AGENT");
  }
  const saved = await updateListing({
    tenantId: gate.ctx.tenant.id,
    listingId,
    property: property.data,
    listing: listing.data,
    agentUserId,
  });
  if (!saved.ok) backTo(back, "error", saved.code);
  backTo(back, "ok", "saved");
}

export async function setListingStatusAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const listingId = str(formData, "listingId");
  const back = `/${lang}/admin/listings/${listingId}`;
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const status = parseStatus(formData.get("status"));
  if (!status) backTo(back, "error", "BAD_STATUS");
  const result = await changeListingStatus(gate.ctx.tenant.id, listingId, status);
  if (!result.ok) backTo(back, "error", result.code);
  await writeAudit({
    tenantId: gate.ctx.tenant.id,
    actorUserId: gate.ctx.user.id,
    kind: "listing.status",
    summary: `Listing status set to ${status}`,
    data: { listingId, status },
  }).catch(() => undefined);
  backTo(back, "ok", "saved");
}

export async function attachPhotosAction(listingId: string, mediaIds: string[]): Promise<Result<{ added: number }>> {
  const gate = await editor(listingId);
  if (!gate) return FORBIDDEN;
  return attachPhotos(gate.ctx.tenant.id, listingId, mediaIds.slice(0, 100));
}

async function photoEditor(formData: FormData) {
  const lang = langOf(formData);
  const photoId = str(formData, "photoId");
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForPhoto(ctx.tenant.id, photoId) : null;
  const gate = await editor(listingId);
  return { lang, photoId, gate, back: `/${lang}/admin/listings/${listingId ?? ""}#photos` };
}

export async function setPhotoAltAction(formData: FormData): Promise<void> {
  const { photoId, gate, back } = await photoEditor(formData);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const decorative = formData.get("decorative") === "on";
  await setPhotoAlt(gate.ctx.tenant.id, photoId, decorative ? "" : str(formData, "alt"));
  backTo(back, "ok", "saved");
}

export async function movePhotoAction(formData: FormData): Promise<void> {
  const { photoId, gate, back } = await photoEditor(formData);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  await movePhoto(gate.ctx.tenant.id, gate.listingId, photoId, formData.get("direction") === "up" ? "up" : "down");
  backTo(back, "ok", "saved");
}

export async function removePhotoAction(formData: FormData): Promise<void> {
  const { photoId, gate, back } = await photoEditor(formData);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  await removePhoto(gate.ctx.tenant.id, gate.listingId, photoId);
  backTo(back, "ok", "saved");
}

export async function setInquiryStatusAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const inquiryId = str(formData, "inquiryId");
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForInquiry(ctx.tenant.id, inquiryId) : null;
  const back = `/${lang}/admin/listings/${listingId ?? ""}#inquiries`;
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const status = formData.get("status");
  if (status !== "new" && status !== "replied" && status !== "closed") backTo(back, "error", "GENERIC");
  await setInquiryStatus(gate.ctx.tenant.id, inquiryId, status);
  backTo(back, "ok", "saved");
}

// ── Tour: rooms ──────────────────────────────────────────────────────────────

function tourPath(lang: string, listingId: string | null, hash = ""): string {
  return `/${lang}/admin/listings/${listingId ?? ""}/tour${hash}`;
}

export async function createScenesAction(
  listingId: string,
  items: { mediaId: string; filename: string }[],
): Promise<Result<{ created: number }>> {
  const gate = await editor(listingId);
  if (!gate) return FORBIDDEN;
  return createScenes(gate.ctx.tenant.id, listingId, items.slice(0, 200));
}

export async function bulkSceneStatusAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const listingId = str(formData, "listingId");
  const back = tourPath(lang, listingId, "#rooms");
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const target = formData.get("target") === "unpublished" ? "unpublished" : "published";
  const ids = formData.getAll("sceneIds").map(String);
  const result = await setSceneStatuses(gate.ctx.tenant.id, listingId, ids, target);
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", `bulk:${result.data.changed}:${result.data.unchanged}`);
}

async function sceneEditor(sceneId: string) {
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForScene(ctx.tenant.id, sceneId) : null;
  return { gate: await editor(listingId), listingId };
}

export async function setStartSceneAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const sceneId = str(formData, "sceneId");
  const { gate, listingId } = await sceneEditor(sceneId);
  const back = tourPath(lang, listingId, "#rooms");
  if (!gate) backTo(back, "error", "FORBIDDEN");
  await setStartScene(gate.ctx.tenant.id, sceneId);
  backTo(back, "ok", "saved");
}

export async function deleteSceneAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const sceneId = str(formData, "sceneId");
  const { gate, listingId } = await sceneEditor(sceneId);
  const back = tourPath(lang, listingId, "#rooms");
  if (!gate) backTo(back, "error", "FORBIDDEN");
  // Deleting a room takes its doorways and hotspots with it: confirmed, server-side too.
  if (formData.get("confirm") !== "on") backTo(`${tourPath(lang, listingId)}/${sceneId}`, "error", "CONFIRM");
  await deleteScene(gate.ctx.tenant.id, sceneId);
  backTo(back, "ok", "saved");
}

export async function updateSceneAction(
  sceneId: string,
  patch: {
    name?: string;
    caption?: string | null;
    startView?: { yaw: number; pitch: number } | null;
    roll?: number | null;
    viewLimit?: number | null;
  },
): Promise<Result<{ saved: true }>> {
  const { gate } = await sceneEditor(sceneId);
  if (!gate) return FORBIDDEN;
  const set: Parameters<typeof updateScene>[2] = {};
  if (patch.name !== undefined) set.name = String(patch.name);
  if (patch.caption !== undefined) set.caption = patch.caption === null ? null : String(patch.caption);
  if (patch.startView !== undefined) {
    const position = patch.startView ? parsePosition(patch.startView.yaw, patch.startView.pitch) : null;
    if (patch.startView && !position) return err("BAD_POSITION", "That view couldn't be read.");
    set.startYaw = position?.yaw ?? null;
    set.startPitch = position?.pitch ?? null;
  }
  if (patch.roll !== undefined) {
    const roll = parseRoll(patch.roll);
    if (roll === undefined) return err("BAD_ROLL", "The horizon correction must be a number.");
    set.rollOffsetDeg = roll;
  }
  if (patch.viewLimit !== undefined) {
    const limit = parseViewLimit(patch.viewLimit);
    if (limit === undefined) return err("BAD_LIMIT", "The view limit must be a number.");
    set.minPitchDeg = limit;
  }
  return updateScene(gate.ctx.tenant.id, sceneId, set);
}

// ── Tour: connections ────────────────────────────────────────────────────────

export async function addLinkAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const listingId = str(formData, "listingId");
  const back = tourPath(lang, listingId, "#connections");
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const from = str(formData, "fromSceneId");
  const to = str(formData, "toSceneId");
  // Both rooms must be in THIS listing (addLink checks they share one; this checks it's this one).
  const [fromListing, toListing] = await Promise.all([
    listingIdForScene(gate.ctx.tenant.id, from),
    listingIdForScene(gate.ctx.tenant.id, to),
  ]);
  if (fromListing !== listingId || toListing !== listingId) backTo(back, "error", "LINK_SCENES");
  const result = await addLink(gate.ctx.tenant.id, from, to, formData.get("bothWays") === "on");
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

export async function deleteLinkAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const linkId = str(formData, "linkId");
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForLink(ctx.tenant.id, linkId) : null;
  const back = tourPath(lang, listingId, "#connections");
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  await deleteLink(gate.ctx.tenant.id, linkId);
  backTo(back, "ok", "saved");
}

export async function updateLinkAction(
  linkId: string,
  patch:
    | { kind: "place"; yaw: number; pitch: number }
    | { kind: "arrival"; yaw: number | null; pitch: number | null }
    | { kind: "rotate"; delta: number }
    | { kind: "name"; name: string | null },
): Promise<Result<{ saved: true }>> {
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForLink(ctx.tenant.id, linkId) : null;
  const gate = await editor(listingId);
  if (!gate) return FORBIDDEN;
  if (patch.kind === "place") {
    const position = parsePosition(patch.yaw, patch.pitch);
    if (!position) return err("BAD_POSITION", "That spot couldn't be read.");
    return updateLink(gate.ctx.tenant.id, linkId, { kind: "place", ...position });
  }
  if (patch.kind === "arrival") {
    if (patch.yaw === null || patch.pitch === null) {
      return updateLink(gate.ctx.tenant.id, linkId, { kind: "arrival", yaw: null, pitch: null });
    }
    const position = parsePosition(patch.yaw, patch.pitch);
    if (!position) return err("BAD_POSITION", "That view couldn't be read.");
    return updateLink(gate.ctx.tenant.id, linkId, { kind: "arrival", ...position });
  }
  if (patch.kind === "rotate") {
    const delta = patch.delta === -15 ? -15 : 15;
    return updateLink(gate.ctx.tenant.id, linkId, { kind: "rotate", delta });
  }
  return updateLink(gate.ctx.tenant.id, linkId, { kind: "name", name: patch.name === null ? null : String(patch.name) });
}

// ── Tour: hotspots ───────────────────────────────────────────────────────────

export async function saveHotspotAction(
  sceneId: string,
  hotspotId: string | null,
  input: { yaw: number; pitch: number; title: string; content: string | null; externalUrl: string | null; momentId: string | null },
): Promise<Result<{ id: string }>> {
  const { gate } = await sceneEditor(sceneId);
  if (!gate) return FORBIDDEN;
  const position = parsePosition(input.yaw, input.pitch);
  if (!position) return err("BAD_POSITION", "That spot couldn't be read.");
  const clean: HotspotInput = {
    ...position,
    title: String(input.title ?? ""),
    content: input.content === null ? null : String(input.content),
    externalUrl: input.externalUrl === null ? null : String(input.externalUrl),
    momentId: input.momentId && /^[0-9a-f-]{36}$/i.test(input.momentId) ? input.momentId : null,
  };
  if (hotspotId) {
    const owner = await listingIdForHotspot(gate.ctx.tenant.id, hotspotId);
    if (owner !== gate.listingId) return FORBIDDEN;
    const result = await updateHotspot(gate.ctx.tenant.id, hotspotId, clean);
    return result.ok ? { ok: true, data: { id: hotspotId } } : result;
  }
  return addHotspot(gate.ctx.tenant.id, sceneId, clean);
}

export async function deleteHotspotAction(hotspotId: string): Promise<Result<{ deleted: true }>> {
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForHotspot(ctx.tenant.id, hotspotId) : null;
  const gate = await editor(listingId);
  if (!gate) return FORBIDDEN;
  return deleteHotspot(gate.ctx.tenant.id, hotspotId);
}

// ── Tour: floor plans ────────────────────────────────────────────────────────

export async function addFloorPlanAction(listingId: string, mediaId: string, label: string): Promise<Result<{ id: string }>> {
  const gate = await editor(listingId);
  if (!gate) return FORBIDDEN;
  return addFloorPlan(gate.ctx.tenant.id, listingId, mediaId, label);
}

async function floorForm(formData: FormData) {
  const lang = langOf(formData);
  const floorPlanId = str(formData, "floorPlanId");
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForFloorPlan(ctx.tenant.id, floorPlanId) : null;
  return { lang, floorPlanId, listingId, gate: await editor(listingId) };
}

export async function renameFloorPlanAction(formData: FormData): Promise<void> {
  const { lang, floorPlanId, listingId, gate } = await floorForm(formData);
  const back = tourPath(lang, listingId, "#floors");
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const result = await renameFloorPlan(gate.ctx.tenant.id, floorPlanId, str(formData, "label"));
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

export async function deleteFloorPlanAction(formData: FormData): Promise<void> {
  const { lang, floorPlanId, listingId, gate } = await floorForm(formData);
  const back = tourPath(lang, listingId, "#floors");
  if (!gate) backTo(back, "error", "FORBIDDEN");
  if (formData.get("confirm") !== "on") backTo(back, "error", "CONFIRM");
  await deleteFloorPlan(gate.ctx.tenant.id, floorPlanId);
  backTo(back, "ok", "saved");
}

export async function autoArrangeFloorAction(formData: FormData): Promise<void> {
  const { lang, floorPlanId, listingId, gate } = await floorForm(formData);
  const back = `${tourPath(lang, listingId)}/floors/${floorPlanId}`;
  if (!gate) backTo(back, "error", "FORBIDDEN");
  await autoArrangeFloor(gate.ctx.tenant.id, floorPlanId);
  backTo(back, "ok", "saved");
}

export async function placeOnPlanAction(
  sceneId: string,
  floorPlanId: string | null,
  point: { x: number; y: number } | null,
): Promise<Result<{ saved: true }>> {
  const { gate } = await sceneEditor(sceneId);
  if (!gate) return FORBIDDEN;
  if (floorPlanId) {
    const owner = await listingIdForFloorPlan(gate.ctx.tenant.id, floorPlanId);
    if (owner !== gate.listingId) return err("FLOOR_NOT_FOUND", "That floor isn't in this listing.");
  }
  const clean = point ? parsePlanPoint(point.x, point.y) : null;
  if (point && !clean) return err("BAD_POSITION", "That spot couldn't be read.");
  return placeSceneOnPlan(gate.ctx.tenant.id, sceneId, floorPlanId, clean);
}

// ── Tour: moments (Before / After) ───────────────────────────────────────────

export async function addMomentAction(formData: FormData): Promise<void> {
  const lang = langOf(formData);
  const listingId = str(formData, "listingId");
  const back = tourPath(lang, listingId, "#moments");
  const gate = await editor(listingId);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const result = await addMoment(gate.ctx.tenant.id, listingId, {
    label: str(formData, "label"),
    baseLabel: formData.get("baseLabel") === null ? undefined : str(formData, "baseLabel"),
    placement: formData.get("placement") === "later" ? "later" : "earlier",
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

async function momentForm(formData: FormData) {
  const lang = langOf(formData);
  const momentId = str(formData, "momentId");
  const ctx = await staff("agent");
  const listingId = ctx ? await listingIdForMoment(ctx.tenant.id, momentId) : null;
  return { lang, momentId, back: tourPath(lang, listingId, "#moments"), gate: await editor(listingId) };
}

export async function renameMomentAction(formData: FormData): Promise<void> {
  const { momentId, back, gate } = await momentForm(formData);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  const result = await renameMoment(gate.ctx.tenant.id, momentId, str(formData, "label"));
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

export async function deleteMomentAction(formData: FormData): Promise<void> {
  const { momentId, back, gate } = await momentForm(formData);
  if (!gate) backTo(back, "error", "FORBIDDEN");
  if (formData.get("confirm") !== "on") backTo(back, "error", "CONFIRM");
  const result = await deleteMoment(gate.ctx.tenant.id, momentId);
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "saved");
}

/** Rights on the scene's listing AND the moment in that same listing. */
async function momentPhotoEditor(sceneId: string, momentId: string) {
  const { gate } = await sceneEditor(sceneId);
  if (!gate) return null;
  const momentListing = await listingIdForMoment(gate.ctx.tenant.id, momentId);
  return momentListing === gate.listingId ? gate : null;
}

export async function setMomentPhotoAction(sceneId: string, momentId: string, mediaId: string): Promise<Result<{ saved: true }>> {
  const gate = await momentPhotoEditor(sceneId, momentId);
  if (!gate) return FORBIDDEN;
  return setMomentPhoto(gate.ctx.tenant.id, sceneId, momentId, mediaId);
}

export async function setMomentHeadingAction(sceneId: string, momentId: string, degrees: number): Promise<Result<{ saved: true }>> {
  const gate = await momentPhotoEditor(sceneId, momentId);
  if (!gate) return FORBIDDEN;
  return setMomentHeading(gate.ctx.tenant.id, sceneId, momentId, Number(degrees));
}

export async function removeMomentPhotoAction(sceneId: string, momentId: string): Promise<Result<{ deleted: true }>> {
  const gate = await momentPhotoEditor(sceneId, momentId);
  if (!gate) return FORBIDDEN;
  return removeMomentPhoto(gate.ctx.tenant.id, sceneId, momentId);
}

// ── Tour: hide people and gear ───────────────────────────────────────────────

export async function applyPrivacyEditAction(
  sceneId: string,
  currentMediaId: string,
  recipe: unknown,
  momentId: string | null = null,
  deleteOriginal: unknown = false,
): Promise<Result<{ mediaId: string }>> {
  const gate = momentId ? await momentPhotoEditor(sceneId, momentId) : (await sceneEditor(sceneId)).gate;
  if (!gate) return FORBIDDEN;
  const parsed = parsePrivacyRecipe(recipe);
  if (!parsed.ok) return parsed;
  const result = await applyPrivacyEdit({
    tenantId: gate.ctx.tenant.id,
    sceneId,
    currentMediaId,
    recipe: parsed.data,
    userId: gate.ctx.user.id,
    momentId,
    deleteOriginal: deleteOriginal === true,
  });
  if (result.ok) {
    await writeAudit({
      tenantId: gate.ctx.tenant.id,
      actorUserId: gate.ctx.user.id,
      kind: "tour.privacy",
      summary: deleteOriginal === true ? "Hide people and gear applied; original deleted" : "Hide people and gear applied to a room",
      data: { sceneId, momentId, mediaId: result.data.mediaId, deleteOriginal: deleteOriginal === true },
    }).catch(() => undefined);
  }
  return result;
}

// ── Spreadsheet import (plans/06) ────────────────────────────────────────────

export async function importTourCsvAction(
  listingId: string,
  csv: unknown,
  photos: unknown,
  replacePhotos: unknown,
): Promise<Result<TourImportResult>> {
  const gate = await editor(listingId);
  if (!gate) return FORBIDDEN;
  if (typeof csv !== "string" || csv.length > CSV_MAX_CHARS) {
    return err("CSV_INVALID", "That file isn't a tour spreadsheet. Check the preview and try again.");
  }
  const uploads = (Array.isArray(photos) ? photos : [])
    .filter(
      (p): p is { filename: string; mediaId: string } =>
        typeof p?.filename === "string" && typeof p?.mediaId === "string",
    )
    .slice(0, CSV_MAX_ROOMS)
    .map((p) => ({ filename: p.filename.slice(0, 255), mediaId: p.mediaId }));
  const result = await importTourCsv({
    tenantId: gate.ctx.tenant.id,
    listingId,
    csv,
    photos: uploads,
    replacePhotos: replacePhotos === true,
  });
  if (result.ok) {
    await writeAudit({
      tenantId: gate.ctx.tenant.id,
      actorUserId: gate.ctx.user.id,
      kind: "tour.imported",
      summary: `Tour imported from a spreadsheet: ${result.data.created} rooms added, ${result.data.updated} updated`,
      data: { listingId, ...result.data },
    }).catch(() => undefined);
  }
  return result;
}
