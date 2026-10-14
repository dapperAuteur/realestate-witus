import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SECONDARY_BUTTON } from "@/components/admin/listing-form";
import { SceneEditor, type EditorLink } from "@/components/admin/scene-editor";
import { tourLabels } from "@/components/listing/listing-view";
import { requireStaffPage } from "@/lib/admin/guard";
import { presetByKey } from "@/lib/brand-presets";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { canEditListing, findOwnedListing } from "@/lib/listings/admin";
import { loadListingTour } from "@/lib/listings/queries";
import { tourEditData } from "@/lib/tour/admin";
import { deleteSceneAction } from "../../../actions";
import { Flash } from "../../../../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit room" };

export default async function SceneEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string; sceneId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang, id, sceneId } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("agent", lang);
  const listing = await findOwnedListing(ctx.tenant.id, id);
  if (!listing || !canEditListing({ role: ctx.role, userId: ctx.user.id }, listing)) notFound();
  const [data, tour] = await Promise.all([
    tourEditData(ctx.tenant.id, id),
    // Every room at any status, opened in this one: placed arrows lead to real rooms.
    loadListingTour(listing, { includeUnpublished: true, requestedSceneId: sceneId }),
  ]);
  const scene = data?.scenes.find((s) => s.id === sceneId);
  if (!data || !scene) notFound();
  const sp = await searchParams;
  const t = dict.admin.tour.scene;
  const nameOf = new Map(data.scenes.map((s) => [s.id, s.name]));
  const toEditorLink = (link: (typeof data.links)[number], other: string): EditorLink => ({
    id: link.id,
    otherSceneId: other,
    otherName: nameOf.get(other) ?? "?",
    name: link.name,
    placed: link.yaw !== null && link.pitch !== null,
    hasArrival: link.arrivalYaw !== null && link.arrivalPitch !== null,
    arrowRotation: link.arrowRotation,
  });
  const outgoing = data.links.filter((l) => l.fromSceneId === sceneId).map((l) => toEditorLink(l, l.toSceneId));
  const incoming = data.links.filter((l) => l.toSceneId === sceneId).map((l) => toEditorLink(l, l.fromSceneId));
  const hotspots = data.hotspots
    .filter((h) => h.sceneId === sceneId)
    .map((h) => ({
      id: h.id,
      yaw: h.yaw,
      pitch: h.pitch,
      title: h.title,
      content: h.content,
      externalUrl: h.externalUrl,
      momentId: h.momentId,
    }));
  const base = `/${lang}/admin/listings/${listing.id}/tour`;

  return (
    <div className="flex flex-col gap-6">
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t.title.replace("{name}", scene.name)}</h2>
        <Link href={base} className={SECONDARY_BUTTON}>
          {t.backToTour}
        </Link>
      </div>
      <SceneEditor
        key={sceneId}
        tour={tour}
        sceneId={sceneId}
        initial={{ name: scene.name, caption: scene.caption, roll: scene.rollOffsetDeg, viewLimit: scene.minPitchDeg }}
        outgoing={outgoing}
        incoming={incoming}
        hotspots={hotspots}
        moments={data.moments.map((m) => ({ id: m.id, label: m.label }))}
        otherTimes={data.moments
          .filter((m) => !m.isBase)
          .map((m) => {
            const photo = data.momentPhotos.find((p) => p.sceneId === sceneId && p.momentId === m.id);
            return {
              momentId: m.id,
              label: m.label,
              photo: photo ? { headingOffsetDeg: photo.headingOffsetDeg, thumbUrl: photo.thumbUrl } : null,
            };
          })}
        uploadLabels={{ ...dict.admin.listings.upload, hint: dict.admin.listings.upload.panoramaHint }}
        editorBase={base}
        labels={{ ...t, ...dict.admin.tour.connections, placed: t.placed, unplaced: t.unplaced }}
        viewerLabels={tourLabels(dict).viewer}
        pinColor={presetByKey(ctx.tenant.theme.presetKey).accent}
      />
      <form action={deleteSceneAction} className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 p-4 dark:border-red-900">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="sceneId" value={sceneId} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.deleteTitle}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t.deleteHint}</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="h-5 w-5" />
          {t.confirmDelete}
        </label>
        <button type="submit" className={`${SECONDARY_BUTTON} border-red-300 text-red-800`}>
          {dict.admin.tour.rooms.delete}
        </button>
      </form>
    </div>
  );
}
