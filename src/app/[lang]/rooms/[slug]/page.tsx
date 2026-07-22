import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import { getRoomTypeBySlug } from "@/lib/rooms";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Room" };

// Room detail (BAM: rooms clickable). Search dates travel via query params so
// the Book CTA lands back on /book with the guest's dates intact.

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string }>;
}) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const r = dict.room;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) notFound();

  const room = await getRoomTypeBySlug(tenant.id, slug);
  if (!room) notFound();

  const { checkIn, checkOut } = await searchParams;
  const bookHref =
    checkIn && checkOut
      ? `/${lang}/book?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}`
      : `/${lang}/book`;
  const [hero, ...rest] = room.photos;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href={`/${lang}`} className="underline underline-offset-4">
          {dict.nav.home}
        </Link>{" "}
        / {dict.sections.roomsTitle}
      </p>
      <h1 className="mt-2 text-3xl font-bold [font-family:var(--font-heading)]">
        {room.name}
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {dict.sections.roomsSleeps} {room.maxOccupancy}
        {room.bedConfig ? <> · {room.bedConfig}</> : null}
        {room.sizeSqm ? <> · {room.sizeSqm} m²</> : null}
      </p>

      {hero ? (
        <figure className="mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary f_auto/q_auto */}
          <img loading="lazy" decoding="async" src={hero.url} alt={hero.alt} className="max-h-96 w-full rounded-2xl object-cover" />
        </figure>
      ) : null}
      {rest.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rest.map((photo) => (
            <li key={photo.photoId}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary f_auto/q_auto */}
              <img loading="lazy" decoding="async" src={photo.url} alt={photo.alt} className="h-36 w-full rounded-xl object-cover" />
            </li>
          ))}
        </ul>
      ) : null}

      {room.description ? (
        <p className="mt-6 max-w-2xl leading-relaxed text-slate-600 dark:text-slate-400">
          {room.description}
        </p>
      ) : null}

      {room.amenities.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {room.amenities.map((amenity) => (
            <li
              key={amenity}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400"
            >
              {amenity}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {r.from}{" "}
          <span className="text-xl font-bold" style={{ color: "var(--brand-accent)" }}>
            {formatMoneyMinor(room.baseRateMinor, room.currency)}
          </span>{" "}
          {r.perNight}
        </p>
        <Link
          href={bookHref}
          className="inline-flex min-h-12 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {r.bookCta}
        </Link>
      </div>
    </main>
  );
}
