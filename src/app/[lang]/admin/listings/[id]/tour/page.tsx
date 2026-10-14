import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACCENT, FIELD, HINT, LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/admin/listing-form";
import { RoomMap } from "@/components/admin/room-map";
import { TourCsvImport } from "@/components/admin/tour-csv-import";
import { FloorPlanUploader, PanoramaUploader } from "@/components/admin/uploaders";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { canEditListing, findOwnedListing } from "@/lib/listings/admin";
import { tourEditData } from "@/lib/tour/admin";
import {
  addLinkAction,
  addMomentAction,
  bulkSceneStatusAction,
  deleteMomentAction,
  renameMomentAction,
  deleteFloorPlanAction,
  deleteLinkAction,
  renameFloorPlanAction,
  setStartSceneAction,
} from "../../actions";
import { Flash } from "../../../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "360 tour" };

// The tour workspace (plans/08 phase D): bulk room creation from uploaded 360
// photos, graph checks (orphans, dead ends, unreachable rooms, unplaced
// doorways), bulk publish, the list-based Connections editor (the accessible
// path plans/04 asks for) beside its room map (plans/04's graph mode), floor
// plans, and building a tour from a spreadsheet (plans/06).

export default async function TourWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("agent", lang);
  const listing = await findOwnedListing(ctx.tenant.id, id);
  if (!listing || !canEditListing({ role: ctx.role, userId: ctx.user.id }, listing)) notFound();
  const data = await tourEditData(ctx.tenant.id, id);
  if (!data) notFound();
  const sp = await searchParams;
  const t = dict.admin.tour;
  const m = t.moments;
  const l = dict.admin.listings;
  const nameOf = new Map(data.scenes.map((scene) => [scene.id, scene.name]));
  const bulk = sp.ok?.startsWith("bulk:") ? sp.ok.split(":") : null;
  const okText = bulk
    ? t.rooms.bulkResult.replace("{changed}", bulk[1] ?? "0").replace("{unchanged}", bulk[2] ?? "0")
    : sp.ok === "saved"
      ? t.scene.saved
      : undefined;
  const card = "rounded-xl border border-slate-200 p-5 dark:border-slate-800";
  const badgesFor = (stats: (typeof data.scenes)[number]["stats"]) =>
    [
      stats.isOrphan ? t.rooms.badges.orphan : null,
      stats.isDeadEnd ? t.rooms.badges.deadEnd : null,
      stats.isUnreachable ? t.rooms.badges.unreachable : null,
      stats.needsPlacement
        ? (stats.needsPlacement === 1 ? t.rooms.badges.needsPlacement : t.rooms.badges.needsPlacementMany).replace(
            "{n}",
            String(stats.needsPlacement),
          )
        : null,
      stats.duplicateTargets.length ? t.rooms.badges.duplicate : null,
    ].filter((badge): badge is string => badge !== null);
  const base = `/${lang}/admin/listings/${listing.id}/tour`;

  return (
    <div className="flex flex-col gap-10">
      <Flash ok={sp.ok} error={sp.error} dict={dict} okText={okText} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {t.title}: {listing.title}
          </h2>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${lang}/admin/listings/${listing.id}`} className={SECONDARY_BUTTON}>
            {t.back}
          </Link>
          <Link href={`/${lang}/listings/${listing.slug}`} className={SECONDARY_BUTTON}>
            {t.previewPage}
          </Link>
        </div>
      </div>

      <section aria-labelledby="upload-title" className={card}>
        <h3 id="upload-title" className="text-lg font-semibold">
          {t.upload.title}
        </h3>
        <p className={HINT}>{t.upload.hint}</p>
        <div className="mt-3">
          <PanoramaUploader listingId={listing.id} labels={{ ...l.upload, hint: l.upload.panoramaHint }} />
        </div>
        <details className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{t.csv.summary}</summary>
          <p className={`${HINT} mb-4`}>{t.csv.intro}</p>
          <TourCsvImport
            listingId={listing.id}
            context={{ rooms: data.scenes.map((scene) => scene.name), floors: data.floorPlans.map((plan) => plan.label) }}
            labels={t.csv}
            uploadLabels={{ ...l.upload, hint: l.upload.panoramaHint }}
          />
        </details>
      </section>

      <section id="rooms" aria-labelledby="rooms-title" className="scroll-mt-24">
        <h3 id="rooms-title" className="text-lg font-semibold">
          {t.rooms.title}
        </h3>
        {data.scenes.length === 0 ? (
          <p className="mt-2 text-sm">{t.rooms.empty}</p>
        ) : (
          <form action={bulkSceneStatusAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="listingId" value={listing.id} />
            <ul className="flex flex-col gap-3">
              {data.scenes.map((scene) => {
                const badges = badgesFor(scene.stats);
                return (
                  <li key={scene.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <label className="flex min-h-11 min-w-11 items-center justify-center">
                      <input type="checkbox" name="sceneIds" value={scene.id} className="h-5 w-5" />
                      <span className="sr-only">{t.rooms.select.replace("{name}", scene.name)}</span>
                    </label>
                    {scene.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={scene.thumbUrl} alt="" className="h-16 w-32 rounded object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {scene.name}
                        {scene.isStart ? (
                          <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900">
                            {t.rooms.start}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{t.rooms.status[scene.status]}</p>
                      {badges.length ? (
                        <ul className="mt-1 flex flex-wrap gap-1">
                          {badges.map((badge) => (
                            <li key={badge} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                              {badge}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`${base}/${scene.id}`} className={SECONDARY_BUTTON}>
                        {t.rooms.edit}
                        <span className="sr-only">: {scene.name}</span>
                      </Link>
                      {scene.isStart ? null : (
                        <button type="submit" formAction={setStartSceneAction} name="sceneId" value={scene.id} className={SECONDARY_BUTTON}>
                          {t.rooms.makeStart}
                          <span className="sr-only">: {scene.name}</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="target" value="published" className={PRIMARY_BUTTON} style={ACCENT}>
                {t.rooms.publishSelected}
              </button>
              <button type="submit" name="target" value="unpublished" className={SECONDARY_BUTTON}>
                {t.rooms.unpublishSelected}
              </button>
            </div>
          </form>
        )}
      </section>

      {data.scenes.length > 1 ? (
        <section id="room-map" aria-labelledby="room-map-title" className={`${card} scroll-mt-24`}>
          <h3 id="room-map-title" className="text-lg font-semibold">
            {t.map.title}
          </h3>
          <p className={HINT}>{t.map.intro}</p>
          <RoomMap
            listingId={listing.id}
            scenes={data.scenes.map((scene) => ({
              id: scene.id,
              name: scene.name,
              thumbUrl: scene.thumbUrl,
              isStart: scene.isStart,
              flags: badgesFor(scene.stats),
            }))}
            links={data.links.map((link) => ({
              fromSceneId: link.fromSceneId,
              toSceneId: link.toSceneId,
              placed: link.yaw !== null && link.pitch !== null,
            }))}
            startSceneId={data.scenes.find((scene) => scene.isStart)?.id ?? null}
            editBase={base}
            labels={t.map}
          />
        </section>
      ) : null}

      {data.scenes.length > 1 ? (
        <section id="connections" aria-labelledby="connections-title" className={`${card} scroll-mt-24`}>
          <h3 id="connections-title" className="text-lg font-semibold">
            {t.connections.title}
          </h3>
          <p className={HINT}>{t.connections.intro}</p>
          <form action={addLinkAction} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="listingId" value={listing.id} />
            <label className={LABEL}>
              {t.connections.from}
              <select name="fromSceneId" className={FIELD}>
                {data.scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              {t.connections.to}
              <select name="toSceneId" defaultValue={data.scenes[1]?.id} className={FIELD}>
                {data.scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="bothWays" defaultChecked className="h-5 w-5" />
              {t.connections.bothWays}
            </label>
            <button type="submit" className={SECONDARY_BUTTON}>
              {t.connections.add}
            </button>
          </form>
          {data.links.length === 0 ? (
            <p className="mt-4 text-sm">{t.connections.none}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {data.links.map((link) => {
                const text = `${nameOf.get(link.fromSceneId) ?? "?"} → ${nameOf.get(link.toSceneId) ?? "?"}`;
                const placed = link.yaw !== null && link.pitch !== null;
                return (
                  <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                    <span>
                      {text}{" "}
                      <span className={placed ? "text-slate-600 dark:text-slate-400" : "font-medium text-amber-800 dark:text-amber-300"}>
                        ({placed ? t.connections.placed : t.connections.unplaced})
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <Link href={`${base}/${link.fromSceneId}`} className={SECONDARY_BUTTON}>
                        {t.rooms.edit}
                        <span className="sr-only">: {text}</span>
                      </Link>
                      <form action={deleteLinkAction}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="linkId" value={link.id} />
                        <button type="submit" className={SECONDARY_BUTTON}>
                          {t.connections.remove}
                          <span className="sr-only">: {text}</span>
                        </button>
                      </form>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {data.scenes.length > 0 ? (
        <section id="moments" aria-labelledby="moments-title" className={`${card} scroll-mt-24`}>
          <h3 id="moments-title" className="text-lg font-semibold">
            {m.title}
          </h3>
          <p className={HINT}>{m.intro}</p>
          {data.moments.length ? (
            <ol className="mt-4 flex flex-col gap-3">
              {data.moments.map((moment) => {
                const covered = moment.isBase
                  ? data.scenes.length
                  : new Set(data.momentPhotos.filter((p) => p.momentId === moment.id).map((p) => p.sceneId)).size;
                return (
                  <li key={moment.id} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <form action={renameMomentAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="momentId" value={moment.id} />
                      <label className={LABEL}>
                        {m.nameField}
                        {moment.isBase ? <span className="ml-1 font-normal text-slate-600 dark:text-slate-400">({m.current})</span> : null}
                        <input name="label" defaultValue={moment.label} maxLength={40} className={FIELD} />
                      </label>
                      <button type="submit" className={SECONDARY_BUTTON}>
                        {m.rename}
                        <span className="sr-only">: {moment.label}</span>
                      </button>
                    </form>
                    <p className="min-h-11 content-center text-sm text-slate-600 dark:text-slate-400">
                      {m.coverage.replace("{n}", String(covered)).replace("{total}", String(data.scenes.length))}
                    </p>
                    {moment.isBase ? null : (
                      <form action={deleteMomentAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="momentId" value={moment.id} />
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input type="checkbox" name="confirm" required className="h-5 w-5" />
                          {m.confirmDelete}
                        </label>
                        <button type="submit" className={SECONDARY_BUTTON}>
                          {m.delete}
                          <span className="sr-only">: {moment.label}</span>
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : null}
          {data.moments.length ? <p className="mt-3 text-sm">{m.next}</p> : null}

          {data.moments.length === 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">{m.presetsLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.presets.map((preset) => (
                  <form key={preset.name} action={addMomentAction}>
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="label" value={preset.other} />
                    <input type="hidden" name="baseLabel" value={preset.base} />
                    <input type="hidden" name="placement" value={preset.placement} />
                    <button type="submit" className={SECONDARY_BUTTON}>
                      {preset.name}
                    </button>
                  </form>
                ))}
              </div>
              <p className={HINT}>{m.presetHint}</p>
            </div>
          ) : null}

          <form action={addMomentAction} className="mt-5 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="listingId" value={listing.id} />
            <p className="text-sm font-semibold sm:col-span-2">{m.customTitle}</p>
            {data.moments.length === 0 ? (
              <label className={LABEL}>
                {m.baseLabel}
                <input name="baseLabel" required maxLength={40} aria-describedby="moment-base-hint" className={FIELD} />
                <span id="moment-base-hint" className={HINT}>
                  {m.baseHint}
                </span>
              </label>
            ) : null}
            <label className={LABEL}>
              {m.label}
              <input name="label" required maxLength={40} aria-describedby="moment-label-hint" className={FIELD} />
              <span id="moment-label-hint" className={HINT}>
                {m.labelHint}
              </span>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className={LABEL}>{m.placement}</legend>
              <div className="mt-1 flex flex-wrap gap-4">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name="placement" value="earlier" defaultChecked className="h-5 w-5" />
                  {m.earlier}
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name="placement" value="later" className="h-5 w-5" />
                  {m.later}
                </label>
              </div>
            </fieldset>
            <div>
              <button type="submit" className={SECONDARY_BUTTON}>
                {m.add}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section id="floors" aria-labelledby="floors-title" className={`${card} scroll-mt-24`}>
        <h3 id="floors-title" className="text-lg font-semibold">
          {t.floors.title}
        </h3>
        <p className={HINT}>{t.floors.intro}</p>
        {data.floorPlans.length === 0 ? (
          <p className="mt-3 text-sm">{t.floors.none}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.floorPlans.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                {plan.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={plan.imageUrl} alt="" className="h-20 w-28 rounded bg-white object-contain" />
                ) : null}
                <form action={renameFloorPlanAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="floorPlanId" value={plan.id} />
                  <label className={LABEL}>
                    {t.floors.label}
                    <input name="label" defaultValue={plan.label} maxLength={40} className={FIELD} />
                  </label>
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {t.floors.rename}
                    <span className="sr-only">: {plan.label}</span>
                  </button>
                </form>
                <Link href={`${base}/floors/${plan.id}`} className={SECONDARY_BUTTON}>
                  {t.floors.pins}
                  <span className="sr-only">: {plan.label}</span>
                </Link>
                <form action={deleteFloorPlanAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="floorPlanId" value={plan.id} />
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="confirm" required className="h-5 w-5" />
                    {t.floors.confirmDelete}
                  </label>
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {t.floors.delete}
                    <span className="sr-only">: {plan.label}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5">
          <FloorPlanUploader
            listingId={listing.id}
            labels={{ ...l.upload, hint: l.upload.floorPlanHint }}
            floorLabel={t.floors.label}
            defaultLabel={data.floorPlans.length ? "" : t.floors.labelDefault}
          />
        </div>
      </section>
    </div>
  );
}
