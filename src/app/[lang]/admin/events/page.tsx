import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { EVENT_KINDS, listEventsAdmin, listRsvps } from "@/lib/events";
import { INQUIRY_STATUSES, listInquiriesAdmin } from "@/lib/venue";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import {
  cancelRsvpAction,
  createEventAction,
  deleteEventAction,
  setInquiryStatusAction,
  updateEventAction,
} from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

type Dict = Awaited<ReturnType<typeof getDictionary>>;

/** datetime-local value for an instant; Accra is UTC year-round. */
function toLocalInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function EventFields({
  a,
  event,
  idPrefix,
}: {
  a: Dict["admin"]["events"];
  event: Awaited<ReturnType<typeof listEventsAdmin>>[number] | null;
  idPrefix: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-title`} className="text-sm font-medium">
          {a.titleField}
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          required
          defaultValue={event?.title ?? ""}
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-desc`} className="text-sm font-medium">
          {a.descriptionField}
        </label>
        <textarea
          id={`${idPrefix}-desc`}
          name="description"
          rows={2}
          defaultValue={event?.description ?? ""}
          className="rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-kind`} className="text-sm font-medium">
            {a.kindField}
          </label>
          <select id={`${idPrefix}-kind`} name="kind" defaultValue={event?.kind ?? "hotel"} className={INPUT}>
            {EVENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {a.kinds[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-starts`} className="text-sm font-medium">
            {a.startsField}
          </label>
          <input
            id={`${idPrefix}-starts`}
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={event ? toLocalInput(event.startsAt) : ""}
            className={INPUT}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-loc`} className="text-sm font-medium">
            {a.locationField}
          </label>
          <input
            id={`${idPrefix}-loc`}
            name="locationText"
            defaultValue={event?.locationText ?? ""}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-cap`} className="text-sm font-medium">
            {a.capacityField}
          </label>
          <input
            id={`${idPrefix}-cap`}
            name="capacity"
            type="number"
            min={1}
            defaultValue={event?.capacity ?? ""}
            className={`${INPUT} w-28`}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="rsvp"
            value="1"
            defaultChecked={event ? event.rsvpMode === "free_rsvp" : true}
            className="h-4 w-4"
          />
          {a.rsvpField}
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isPublished"
            value="1"
            defaultChecked={event?.isPublished ?? false}
            className="h-4 w-4"
          />
          {a.publishedField}
        </label>
      </div>
    </>
  );
}

export default async function AdminEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("manager", lang);
  const a = dict.admin.events;
  const sp = await searchParams;

  const rows = await listEventsAdmin(ctx.tenant.id);
  const inquiries = await listInquiriesAdmin(ctx.tenant.id);
  const rsvpsByEvent = new Map(
    await Promise.all(
      rows.map(
        async (event) =>
          [event.id, await listRsvps(ctx.tenant.id, event.id)] as const,
      ),
    ),
  );

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>

      <section
        aria-label={a.createTitle}
        className="mt-6 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700"
      >
        <h2 className="text-lg font-semibold">{a.createTitle}</h2>
        <form action={createEventAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="lang" value={lang} />
          <EventFields a={a} event={null} idPrefix="new" />
          <button
            type="submit"
            className="inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {a.create}
          </button>
        </form>
      </section>

      <section aria-label={a.inquiriesTitle} className="mt-8 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-lg font-semibold">{a.inquiriesTitle}</h2>
        {inquiries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{a.inquiriesEmpty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-sm last:border-b-0 dark:border-slate-800">
                <span className="min-w-0">
                  <strong>{inquiry.name}</strong>
                  <span className="text-slate-500">
                    {" "}· {inquiry.email}{inquiry.phone ? ` · ${inquiry.phone}` : ""}
                    {inquiry.eventType ? ` · ${inquiry.eventType}` : ""}
                    {inquiry.preferredDate ? ` · ${inquiry.preferredDate}` : ""}
                    {inquiry.partySize ? ` · ×${inquiry.partySize}` : ""}
                    {inquiry.budgetRange ? ` · ${inquiry.budgetRange}` : ""}
                  </span>
                  {inquiry.message ? (
                    <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{inquiry.message}</span>
                  ) : null}
                </span>
                <form action={setInquiryStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="inquiryId" value={inquiry.id} />
                  <label className="sr-only" htmlFor={`inq-${inquiry.id}`}>{a.setStatus}</label>
                  <select id={`inq-${inquiry.id}`} name="status" defaultValue={inquiry.status} className={INPUT}>
                    {INQUIRY_STATUSES.map((status) => (
                      <option key={status} value={status}>{a.inquiryStatuses[status]}</option>
                    ))}
                  </select>
                  <button type="submit" className={BUTTON}>
                    {a.setStatus}
                    <span className="sr-only"> {inquiry.name}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{a.empty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {rows.map((event) => {
            const rsvps = rsvpsByEvent.get(event.id) ?? [];
            return (
              <li
                key={event.id}
                className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <p className="text-xs text-slate-500">
                  {event.rsvpCount}
                  {event.capacity ? `/${event.capacity}` : ""} {a.rsvps}
                  {!event.isPublished ? " · draft" : ""}
                </p>
                <form action={updateEventAction} className="mt-2 flex flex-col gap-4">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <EventFields a={a} event={event} idPrefix={event.id.slice(0, 8)} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                      style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                    >
                      {a.save}
                      <span className="sr-only"> {event.title}</span>
                    </button>
                    <button type="submit" formAction={deleteEventAction} className={BUTTON}>
                      {a.delete}
                      <span className="sr-only"> {event.title}</span>
                    </button>
                  </div>
                </form>

                <details className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <summary className="min-h-11 cursor-pointer text-sm font-medium">
                    {a.rsvpListTitle} ({rsvps.length})
                  </summary>
                  {rsvps.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">{a.noRsvps}</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                      {rsvps.map((rsvp) => (
                        <li
                          key={rsvp.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <span className={rsvp.status === "cancelled" ? "line-through opacity-60" : ""}>
                            {rsvp.name} · {rsvp.email} · ×{rsvp.partySize}
                          </span>
                          {rsvp.status !== "cancelled" ? (
                            <form action={cancelRsvpAction}>
                              <input type="hidden" name="lang" value={lang} />
                              <input type="hidden" name="rsvpId" value={rsvp.id} />
                              <button type="submit" className={BUTTON}>
                                {a.cancelRsvp}
                                <span className="sr-only"> {rsvp.name}</span>
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
