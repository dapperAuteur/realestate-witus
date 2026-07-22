import Link from "next/link";
import type { TenantRecord } from "@/lib/tenant";
import type { Dictionary } from "@/lib/dictionaries";
import type { siteSections } from "@/db/schema";
import type { TemplateDef } from "@/lib/templates";
import { Paragraphs } from "./paragraphs";

type SiteSectionRow = typeof siteSections.$inferSelect;

/**
 * Hero. Template decides the structure: "fullbleed" (editorial flagship —
 * photo IS the layout, scrim keeps AA contrast, display type overlaid) vs
 * "boxed" (classic/warm — image card above type). Both fall back gracefully
 * to a type-led hero when the owner has no photo yet. Rung-2 variants:
 * "image" | "minimal" (minimal suppresses the photo on purpose).
 */
export function HeroSection({
  tenant,
  row,
  variant,
  dict,
  lang,
  tpl,
}: {
  tenant: TenantRecord;
  row: SiteSectionRow | undefined;
  variant: string;
  dict: Dictionary;
  lang: string;
  tpl: TemplateDef;
}) {
  const name = row?.title ?? tenant.theme.name ?? tenant.name;
  const data = (row?.data ?? {}) as { imageUrl?: string; imageAlt?: string };
  const showImage = variant === "image" && Boolean(data.imageUrl);

  const cta = (
    <Link
      href={`/${lang}/book`}
      className={`${tpl.t.action} rounded-full`}
      style={{
        background: "var(--brand-accent)",
        color: "var(--brand-accent-fg)",
      }}
    >
      {dict.home.searchRooms}
    </Link>
  );

  if (tpl.hero === "fullbleed" && showImage) {
    return (
      <header className="relative flex min-h-[70vh] items-end">
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-hosted URL */}
        <img fetchPriority="high" decoding="async"
          src={data.imageUrl}
          alt={data.imageAlt ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Scrim keeps AA contrast for the overlaid type on any photo. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent"
        />
        <div className="relative mx-auto w-full max-w-4xl px-4 pb-14 pt-40 text-white">
          <h1 className={tpl.t.display}>{name}</h1>
          {tenant.tagline ? (
            <p className="mt-3 max-w-xl text-lg text-white/90">{tenant.tagline}</p>
          ) : null}
          {row?.body ? (
            <div className="mt-4 hidden max-w-xl text-white/85 sm:block [&_p]:text-white/85">
              <Paragraphs text={row.body} />
            </div>
          ) : null}
          <div className="mt-7">{cta}</div>
        </div>
      </header>
    );
  }

  return (
    <header className="mx-auto max-w-4xl px-4">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner-hosted URL
        <img fetchPriority="high" decoding="async"
          src={data.imageUrl}
          alt={data.imageAlt ?? ""}
          className={`w-full object-cover ${tpl.key === "warm" ? "h-64 rounded-3xl sm:h-80" : "h-64 rounded-2xl sm:h-80"} mt-6`}
        />
      ) : null}
      <div className={showImage ? "mt-6" : "pt-10"}>
        <h1 className={tpl.t.display}>{name}</h1>
        {tenant.tagline ? (
          <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
            {tenant.tagline}
          </p>
        ) : null}
        {row?.body ? (
          <div className="mt-4 max-w-2xl">
            <Paragraphs text={row.body} />
          </div>
        ) : null}
        <div className="mt-6">{cta}</div>
      </div>
    </header>
  );
}
