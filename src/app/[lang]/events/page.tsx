import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listUpcomingEvents } from "@/lib/events";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { resolveTenant } from "@/lib/tenant";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelSettings } from "@/db/schema";
import Link from "next/link";
import { rsvpAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900";

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string; event?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const e = dict.events;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform || !tenant.flags.events) notFound();

  const sp = await searchParams;
  const upcoming = await listUpcomingEvents(tenant.id);
  const [settings] = await db()
    .select({ timezone: hotelSettings.timezone })
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, tenant.id))
    .limit(1);
  const formatter = new Intl.DateTimeFormat("en-GH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: settings?.timezone ?? "Africa/Accra",
  });
  const errorText =
    sp.error && sp.error in e.errors
      ? e.errors[sp.error as keyof typeof e.errors]
      : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {e.title}
      </h1>
      <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-400">{e.intro}</p>

      {upcoming.length === 0 ? (
        <p className="mt-8 text-slate-600 dark:text-slate-400">{e.empty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {upcoming.map((event) => {
            const spotsLeft =
              event.capacity !== null ? event.capacity - event.rsvpCount : null;
            const full = spotsLeft !== null && spotsLeft <= 0;
            const flash = sp.event === event.id;
            return (
              <li
                key={event.id}
                id={`ev-${event.id}`}
                className="scroll-mt-20 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <p className="text-sm font-semibold" style={{ color: "var(--brand-accent)" }}>
                  <time dateTime={event.startsAt.toISOString()}>
                    {formatter.format(event.startsAt)}
                  </time>
                  {event.locationText ? (
                    <span className="text-slate-500"> · {event.locationText}</span>
                  ) : null}
                </p>
                <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-heading)]">
                  {event.title}
                </h2>
                {event.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {event.description}
                  </p>
                ) : null}

                {event.rsvpMode === "free_rsvp" ? (
                  <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                    {spotsLeft !== null ? (
                      <p className="text-xs font-medium text-slate-500">
                        {full ? e.fullBadge : `${spotsLeft} ${e.spotsLeft}`}
                      </p>
                    ) : null}
                    {flash && sp.ok ? (
                      <p role="status" aria-live="polite" className="mt-2 text-sm font-medium" style={{ color: "var(--brand-accent)" }}>
                        {e.reservedBody}
                      </p>
                    ) : null}
                    {flash && errorText ? (
                      <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                        {errorText}
                      </p>
                    ) : null}
                    {!full && !(flash && sp.ok) ? (
                      <form action={rsvpAction} className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="eventId" value={event.id} />
                        <div className="flex min-w-40 flex-1 flex-col gap-1">
                          <label htmlFor={`n-${event.id}`} className="text-xs font-medium">
                            {e.nameField}
                          </label>
                          <input id={`n-${event.id}`} name="name" required className={INPUT} />
                        </div>
                        <div className="flex min-w-48 flex-1 flex-col gap-1">
                          <label htmlFor={`e-${event.id}`} className="text-xs font-medium">
                            {e.emailField}
                          </label>
                          <input id={`e-${event.id}`} name="email" type="email" required className={INPUT} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`p-${event.id}`} className="text-xs font-medium">
                            {e.partyField}
                          </label>
                          <input
                            id={`p-${event.id}`}
                            name="partySize"
                            type="number"
                            min={1}
                            max={10}
                            defaultValue={1}
                            className={`${INPUT} w-20`}
                          />
                        </div>
                        <button
                          type="submit"
                          className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                        >
                          {e.submit}
                          <span className="sr-only"> {event.title}</span>
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-10">
        <Link
          href={`/${lang}/venue`}
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {dict.venue.title} →
        </Link>
      </p>
    </main>
  );
}
