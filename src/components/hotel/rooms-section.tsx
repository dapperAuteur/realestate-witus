import Link from "next/link";
import type { roomTypes } from "@/db/schema";
import type { Dictionary } from "@/lib/dictionaries";
import { formatMoneyMinor } from "@/lib/money";
import type { RoomPhoto } from "@/lib/rooms";
import type { TemplateDef } from "@/lib/templates";
import { SectionShell } from "./section-shell";

type RoomTypeRow = typeof roomTypes.$inferSelect;

/**
 * Rooms. Template decides the treatment: "editorial" renders alternating
 * image/text rows (photography-first, big serif price); "cards" keeps the
 * grid/list cards. Rung-2 variant grid|list still applies within each.
 * Whole card/row is the click target (stretched link).
 */
export function RoomsSection({
  rooms,
  variant,
  dict,
  lang,
  thumbnails,
  tpl,
}: {
  rooms: RoomTypeRow[];
  variant: string;
  dict: Dictionary;
  lang: string;
  thumbnails: Map<string, RoomPhoto>;
  tpl: TemplateDef;
}) {
  if (rooms.length === 0) return null;
  const s = dict.sections;

  if (tpl.rooms === "editorial") {
    return (
      <SectionShell tpl={tpl} id="rooms" title={s.roomsTitle}>
        <ul className="flex flex-col gap-12 sm:gap-16">
          {rooms.map((room, index) => {
            const photo = thumbnails.get(room.id);
            return (
              <li
                key={room.id}
                className={`group relative flex flex-col gap-5 sm:items-center ${index % 2 === 1 ? "sm:flex-row-reverse" : "sm:flex-row"}`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary f_auto/q_auto
                  <img loading="lazy" decoding="async"
                    src={photo.url}
                    alt=""
                    className="h-64 w-full object-cover sm:h-80 sm:w-3/5"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="hidden h-80 w-3/5 sm:block"
                    style={{
                      background:
                        "color-mix(in srgb, var(--brand-accent) 12%, transparent)",
                    }}
                  />
                )}
                <div className="sm:w-2/5">
                  <h3 className="text-2xl font-semibold tracking-tight [font-family:var(--font-heading)] sm:text-3xl">
                    {/* Stretched link: the whole row is the button. */}
                    <Link
                      href={`/${lang}/rooms/${room.slug}`}
                      className="after:absolute after:inset-0 focus:outline-none group-hover:underline group-hover:underline-offset-4"
                    >
                      {room.name}
                    </Link>
                  </h3>
                  {room.description ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {room.description}
                    </p>
                  ) : null}
                  <p
                    className="mt-4 text-2xl font-semibold [font-family:var(--font-heading)]"
                    style={{ color: "var(--brand-accent)" }}
                  >
                    {formatMoneyMinor(room.baseRateMinor, room.currency)}
                    <span className="ml-2 text-xs font-normal uppercase tracking-widest text-slate-500">
                      {s.roomsPerNight}
                    </span>
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">
                    {s.roomsSleeps} {room.maxOccupancy}
                    {room.bedConfig ? <> · {room.bedConfig}</> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </SectionShell>
    );
  }

  return (
    <SectionShell tpl={tpl} id="rooms" title={s.roomsTitle}>
      <ul
        className={
          variant === "list"
            ? "flex flex-col gap-4"
            : "grid gap-4 sm:grid-cols-2"
        }
      >
        {rooms.map((room) => (
          <li
            key={room.id}
            className={`relative overflow-hidden ${tpl.t.card} transition-shadow focus-within:ring-2 focus-within:ring-current hover:shadow-md`}
          >
            {thumbnails.get(room.id) ? (
              /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary f_auto/q_auto */
              <img loading="lazy" decoding="async"
                src={thumbnails.get(room.id)?.url}
                alt=""
                className="h-44 w-full object-cover"
              />
            ) : null}
            <div className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold [font-family:var(--font-heading)]">
                  {/* Stretched link: the whole card is the button. */}
                  <Link
                    href={`/${lang}/rooms/${room.slug}`}
                    className="after:absolute after:inset-0 focus:outline-none"
                  >
                    {room.name}
                  </Link>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {s.roomsFrom}{" "}
                  <span
                    className="text-base font-semibold"
                    style={{ color: "var(--brand-accent)" }}
                  >
                    {formatMoneyMinor(room.baseRateMinor, room.currency)}
                  </span>{" "}
                  {s.roomsPerNight}
                </p>
              </div>
              {room.description ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {room.description}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                {s.roomsSleeps} {room.maxOccupancy}
                {room.bedConfig ? <> · {room.bedConfig}</> : null}
                {room.sizeSqm ? <> · {room.sizeSqm} m²</> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
