import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAvailability } from "@/lib/booking/availability";
import { isIsoDate } from "@/lib/booking/dates";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import { resolveTenant } from "@/lib/tenant";
import Link from "next/link";
import { thumbnailsForRoomTypes } from "@/lib/rooms";
import { holdRoomAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Book" };

// Search → results. The form is a GET so results are linkable/refreshable;
// reserving a room POSTs the hold action. Tenant hosts only.

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const b = dict.book;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) notFound();

  const { checkIn, checkOut, error } = await searchParams;
  const hasSearch = Boolean(checkIn && checkOut && isIsoDate(checkIn) && isIsoDate(checkOut));
  const results = hasSearch
    ? await getAvailability({
        tenantId: tenant.id,
        checkIn: checkIn as string,
        checkOut: checkOut as string,
      })
    : null;

  const errorText =
    error && error in b.errors ? b.errors[error as keyof typeof b.errors] : null;
  const thumbnails =
    results?.ok && results.data.length > 0
      ? await thumbnailsForRoomTypes(results.data.map((room) => room.roomTypeId))
      : new Map();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {dict.home.bookYourStay}
      </h1>

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="checkIn" className="text-sm font-medium">
            {dict.home.checkIn}
          </label>
          <input
            id="checkIn"
            name="checkIn"
            type="date"
            required
            defaultValue={checkIn}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="checkOut" className="text-sm font-medium">
            {dict.home.checkOut}
          </label>
          <input
            id="checkOut"
            name="checkOut"
            type="date"
            required
            defaultValue={checkOut}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {dict.home.searchRooms}
        </button>
      </form>

      {errorText ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorText}
        </p>
      ) : null}

      {results ? (
        results.ok ? (
          <ul className="mt-8 flex flex-col gap-4">
            {results.data.map((room) => (
              <li
                key={room.roomTypeId}
                className="relative flex flex-wrap gap-4 rounded-xl border border-slate-200 p-5 transition-shadow focus-within:ring-2 focus-within:ring-current hover:shadow-md dark:border-slate-800"
              >
                {thumbnails.get(room.roomTypeId) ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary f_auto/q_auto */
                  <img loading="lazy" decoding="async"
                    src={thumbnails.get(room.roomTypeId)?.url}
                    alt=""
                    className="h-28 w-40 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">
                    {/* Stretched link: the whole card opens the room (BAM). */}
                    <Link
                      href={`/${lang}/rooms/${room.slug}?checkIn=${encodeURIComponent(checkIn ?? "")}&checkOut=${encodeURIComponent(checkOut ?? "")}`}
                      className="after:absolute after:inset-0 focus:outline-none"
                    >
                      {room.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <span
                      className="text-base font-semibold"
                      style={{ color: "var(--brand-accent)" }}
                    >
                      {formatMoneyMinor(room.rates.totalMinor, room.currency)}
                    </span>{" "}
                    {b.totalForStay} {room.rates.nights.length} {b.nights}
                  </p>
                </div>
                {room.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {room.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  {dict.sections.roomsSleeps} {room.maxOccupancy}
                </p>
                {room.freeUnits > 0 ? (
                  // relative z-10: above the stretched overlay so Reserve stays tappable
                  <form action={holdRoomAction} className="relative z-10 mt-4 w-fit">
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="roomTypeId" value={room.roomTypeId} />
                    <input type="hidden" name="checkIn" value={checkIn} />
                    <input type="hidden" name="checkOut" value={checkOut} />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                      style={{
                        background: "var(--brand-accent)",
                        color: "var(--brand-accent-fg)",
                      }}
                    >
                      {b.reserve}
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 text-sm font-medium text-slate-500">
                    {b.soldOut}
                  </p>
                )}
                </div>
              </li>
            ))}
            {results.data.length === 0 ? (
              <li className="text-slate-600 dark:text-slate-400">{b.noRooms}</li>
            ) : null}
          </ul>
        ) : (
          <p role="alert" className="mt-8 text-sm text-red-800 dark:text-red-300">
            {results.code in b.errors
              ? b.errors[results.code as keyof typeof b.errors]
              : b.errors.GENERIC}
          </p>
        )
      ) : null}
    </main>
  );
}
