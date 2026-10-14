import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { FIELD, HINT, LABEL, ListingForm, SECONDARY_BUTTON } from "@/components/admin/listing-form";
import { PhotoUploader } from "@/components/admin/uploaders";
import { StatusChip } from "@/components/listing/status-chip";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { DEMO_SLUG_SUFFIX } from "@/lib/demo/clone";
import { DEMO_HOST } from "@/lib/demo/seed";
import { assignableAgents, canEditListing, findOwnedListing, listingEditData } from "@/lib/listings/admin";
import { embedSnippet, listingEmbedUrl, listingPageUrl } from "@/lib/listings/embed";
import { isPublicStatus, type ListingStatus } from "@/lib/listings/format";
import { requestOrigin } from "@/lib/listings/origin";
import { roleSatisfies } from "@/lib/rbac";
import {
  copyToDemoNowAction,
  movePhotoAction,
  removePhotoAction,
  saveListingAction,
  setInquiryStatusAction,
  setListingStatusAction,
  setPhotoAltAction,
  stopDemoAction,
  useForDemoAction,
} from "../actions";
import { Flash } from "../../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit listing" };

const STATUSES: ListingStatus[] = ["draft", "for_sale", "under_offer", "sold", "withdrawn"];

export default async function EditListingPage({
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
  const data = await listingEditData(ctx.tenant.id, id);
  if (!data || !canEditListing({ role: ctx.role, userId: ctx.user.id }, data.listing)) notFound();
  const sp = await searchParams;
  const l = dict.admin.listings;
  const { listing, property, photos, inquiries, views30d } = data;
  const status = listing.status as ListingStatus;
  const canAssign = roleSatisfies(ctx.role, "manager");
  const agents = canAssign ? await assignableAgents(ctx.tenant) : undefined;
  const origin = await requestOrigin();
  const pageUrl = listingPageUrl(origin, listing.slug, lang);
  const snippet = embedSnippet({
    embedUrl: listingEmbedUrl(origin, listing.slug),
    title: dict.listing.embed.title.replace("{title}", listing.title),
  });
  const okText =
    sp.ok === "created"
      ? l.created
      : sp.ok === "saved"
        ? l.saved
        : sp.ok === "demo"
          ? l.demo.copied
          : sp.ok === "demoStopped"
            ? l.demo.stopped
            : undefined;
  // BAM's own listings only: which one the demo agency copies (lib/demo/clone.ts).
  const demoOwner = Boolean(ctx.tenant.flags.platform) && ctx.role === "owner";
  const demoSourceId = ctx.tenant.flags.demoSourceListingId ?? null;
  const otherDemoSource =
    demoOwner && demoSourceId && demoSourceId !== listing.id ? await findOwnedListing(ctx.tenant.id, demoSourceId) : null;
  const demoUrl = `https://${DEMO_HOST}/${lang}/listings/${listing.slug}${DEMO_SLUG_SUFFIX}`;
  const sectionTitle = "text-lg font-semibold";
  const card = "rounded-xl border border-slate-200 p-5 dark:border-slate-800";

  return (
    <div className="flex flex-col gap-10">
      <Flash ok={sp.ok} error={sp.error} dict={dict} okText={okText} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{listing.title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{property.addressLine1}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${lang}/admin/listings/${listing.id}/tour`} className={SECONDARY_BUTTON}>
            {dict.admin.tour.title}
          </Link>
          <Link href={`/${lang}/listings/${listing.slug}`} className={SECONDARY_BUTTON}>
            {l.viewPage}
          </Link>
        </div>
      </div>

      <section aria-labelledby="status-title" className={card}>
        <h3 id="status-title" className={sectionTitle}>
          {l.status.title}
        </h3>
        <p className={HINT}>{l.status.intro}</p>
        <form action={setListingStatusAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="listingId" value={listing.id} />
          <StatusChip status={status} label={l.status.current.replace("{status}", dict.listing.status[status])} />
          <label className={LABEL}>
            <span className="sr-only">{l.status.title}</span>
            <select name="status" defaultValue={status} className={FIELD}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {dict.listing.status[value]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={SECONDARY_BUTTON}>
            {l.status.set}
          </button>
        </form>
      </section>

      <section aria-labelledby="embed-title" className={card}>
        <h3 id="embed-title" className={sectionTitle}>
          {l.embed.title}
        </h3>
        <p className={HINT}>{l.embed.intro}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-sm">
          {l.embed.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="mt-3">
          <CopyButton value={snippet} label={l.embed.snippetLabel} />
        </div>
        <p className="mt-3 text-sm">
          {l.embed.pageLink}: <CopyButton value={pageUrl} label={l.embed.pageLink} />
        </p>
        {isPublicStatus(status) ? null : <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300">{l.embed.draftNote}</p>}
      </section>

      <section aria-labelledby="numbers-title" className={card}>
        <h3 id="numbers-title" className={sectionTitle}>
          {l.numbers.title}
        </h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          {([
            ["page", l.numbers.page, views30d.page],
            ["embed", l.numbers.embed, views30d.embed],
          ] as const).map(([key, label, numbers]) => (
            <div key={key}>
              <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
              <dd className="font-semibold">
                {l.numbers.views.replace("{n}", String(numbers.pageViews))}, {l.numbers.opens.replace("{n}", String(numbers.tourOpens))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href={`/${lang}/admin/listings/${listing.id}/report`} className={SECONDARY_BUTTON}>
            {l.report.open}
          </Link>
          <p className={HINT}>{l.report.openHint}</p>
        </div>
      </section>

      {demoOwner ? (
        <section id="demo" aria-labelledby="demo-title" className={`${card} scroll-mt-24`}>
          <h3 id="demo-title" className={sectionTitle}>
            {l.demo.title}
          </h3>
          <p className={HINT}>{l.demo.intro}</p>
          {demoSourceId === listing.id ? (
            <>
              <p className="mt-3 text-sm font-medium">{l.demo.isSource}</p>
              <p className="mt-2 text-sm">
                {l.demo.demoLink}: <CopyButton value={demoUrl} label={l.demo.demoLink} />
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={copyToDemoNowAction}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {l.demo.copyNow}
                  </button>
                </form>
                <form action={stopDemoAction}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {l.demo.stop}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm">
                {otherDemoSource ? l.demo.otherSource.replace("{title}", otherDemoSource.title) : l.demo.none}
              </p>
              {isPublicStatus(status) ? (
                <form action={useForDemoAction} className="mt-3">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button type="submit" className={SECONDARY_BUTTON}>
                    {l.demo.use}
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300">{l.demo.needsLive}</p>
              )}
            </>
          )}
        </section>
      ) : null}

      <section id="photos" aria-labelledby="photos-title" className={card}>
        <h3 id="photos-title" className={sectionTitle}>
          {l.photos.title}
        </h3>
        <p className={HINT}>{l.photos.intro}</p>
        <div className="mt-4">
          <PhotoUploader listingId={listing.id} labels={{ ...l.upload, hint: l.upload.photoHint }} />
        </div>
        {photos.length === 0 ? (
          <p className="mt-4 text-sm">{l.photos.empty}</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-4">
            {photos.map((photo, i) => {
              const name = l.photos.photoN.replace("{n}", String(i + 1));
              return (
                <li key={photo.id} className="flex flex-wrap gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  {photo.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.thumbUrl} alt="" className="h-24 w-36 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {name}
                      {!photo.alt ? <span className="ml-2 text-amber-800 dark:text-amber-300">{l.photos.altMissing}</span> : null}
                    </p>
                    <form action={setPhotoAltAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="photoId" value={photo.id} />
                      <label className={`${LABEL} min-w-56 flex-1`}>
                        {l.photos.alt}
                        <input name="alt" defaultValue={photo.alt} maxLength={300} className={FIELD} />
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" name="decorative" className="h-5 w-5" />
                        {l.photos.decorative}
                      </label>
                      <button type="submit" className={SECONDARY_BUTTON}>
                        {l.photos.saveAlt}
                        <span className="sr-only">: {name}</span>
                      </button>
                    </form>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["up", "down"] as const).map((direction) => (
                        <form key={direction} action={movePhotoAction}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="photoId" value={photo.id} />
                          <input type="hidden" name="direction" value={direction} />
                          <button
                            type="submit"
                            disabled={(direction === "up" && i === 0) || (direction === "down" && i === photos.length - 1)}
                            className={`${SECONDARY_BUTTON} disabled:opacity-40`}
                          >
                            {direction === "up" ? l.photos.up : l.photos.down}
                            <span className="sr-only">: {name}</span>
                          </button>
                        </form>
                      ))}
                      <form action={removePhotoAction}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="photoId" value={photo.id} />
                        <button type="submit" className={SECONDARY_BUTTON}>
                          {l.photos.remove}
                          <span className="sr-only">: {name}</span>
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section id="inquiries" aria-labelledby="inquiries-title" className={card}>
        <h3 id="inquiries-title" className={sectionTitle}>
          {l.inquiries.title}
        </h3>
        {inquiries.length === 0 ? (
          <p className="mt-2 text-sm">{l.inquiries.empty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <p className="font-semibold">
                  {inquiry.kind === "tour_request" ? l.inquiries.tour : l.inquiries.question} · {inquiry.name} · {" "}
                  {new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(inquiry.createdAt)}
                </p>
                <p>
                  <a href={`mailto:${inquiry.email}`} className="underline underline-offset-4">
                    {inquiry.email}
                  </a>
                  {inquiry.phone ? ` · ${inquiry.phone}` : ""}
                </p>
                {inquiry.preferredTimes ? <p>{l.inquiries.when.replace("{times}", inquiry.preferredTimes)}</p> : null}
                {inquiry.message ? <p className="mt-1 whitespace-pre-line">{inquiry.message}</p> : null}
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  {l.inquiries.via.replace(
                    "{surface}",
                    inquiry.surface === "embed" ? l.inquiries.surfaceEmbed : l.inquiries.surfacePage,
                  )}
                </p>
                <form action={setInquiryStatusAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="inquiryId" value={inquiry.id} />
                  <span>{l.inquiries.mark}</span>
                  {(["new", "replied", "closed"] as const).map((value) => (
                    <button
                      key={value}
                      type="submit"
                      name="status"
                      value={value}
                      aria-pressed={inquiry.status === value}
                      className={`${SECONDARY_BUTTON} aria-pressed:bg-slate-900 aria-pressed:text-white`}
                    >
                      {l.inquiries.status[value]}
                    </button>
                  ))}
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="details-title">
        <h3 id="details-title" className={`${sectionTitle} mb-4`}>
          {l.form.listingTitle}
        </h3>
        <ListingForm
          action={saveListingAction}
          dict={dict}
          lang={lang}
          submitLabel={l.form.save}
          listing={listing}
          property={property}
          agents={agents}
        />
      </section>
    </div>
  );
}
