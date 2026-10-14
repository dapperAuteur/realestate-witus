import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ListingCard } from "@/components/listing/listing-card";
import { SiteFooter } from "@/components/site-footer";
import { EmbedMock, TourMock } from "@/components/tour-mock";
import { DEMO_HOST } from "@/lib/demo/seed";
import type { Dictionary } from "@/lib/dictionaries";
import type { ListingCard as ListingCardData } from "@/lib/listings/queries";
import type { Locale } from "@/lib/locales";

// The RealEstate.WitUS product landing, shown on platform hosts
// (realestate.witus.online, vercel.app previews, localhost).
//
// Hand-rolled Tailwind per plans/03: slate neutrals, the brand accent as the
// single colour, mobile-first at 375, 44px targets, focus-visible rings, and
// no photography (the repo ships none — the product illustrations in
// tour-mock.tsx stand in honestly rather than borrowing stock images).
//
// Copy is a working draft in en.json — BAM reviews and owns the words before
// any marketing push (content rule: humans own what customers read). Prices
// are deliberately absent: BAM quotes per property.

// A placeholder slug, not a live address: handing out a URL that 404s would be
// worse than showing the shape. Real snippets are generated per listing.
const SNIPPET = `<iframe src="https://your-agency.example/embed/listings/your-listing" width="100%" height="480" style="border:0" allowfullscreen title="360 tour"></iframe>`;

const FOCUS =
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

function SolidCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-semibold ${FOCUS}`}
      style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
    >
      {children}
    </a>
  );
}

export function PlatformLanding({
  dict,
  lang,
  promoBanner,
  showcase = [],
}: {
  dict: Dictionary;
  lang: Locale;
  promoBanner?: string | null;
  /**
   * Real, published listings with a live tour (BAM's own service listings).
   * plans/08 6.5: proof only from real tours, so the row simply isn't there
   * until one exists.
   */
  showcase?: ListingCardData[];
}) {
  const d = dict.landing;

  return (
    <>
      {promoBanner ? (
        <aside
          role="status"
          className="border-b border-slate-200 px-6 py-2 text-center text-sm font-medium dark:border-slate-800"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {promoBanner}
        </aside>
      ) : null}

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--brand-accent)" }}
              >
                {d.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                {d.headline}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                {d.subhead}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <SolidCta href={`https://${DEMO_HOST}`}>{d.ctaPrimary}</SolidCta>
                <Link
                  href={`/${lang}/roadmap`}
                  className={`inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold dark:border-slate-700 ${FOCUS}`}
                >
                  {d.ctaSecondary}
                </Link>
              </div>
            </div>

            <TourMock
              label={d.heroMockLabel}
              scene={d.heroMockScene}
              scenes={d.heroMockScenes}
            />
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="how-heading"
          className="border-b border-slate-200 dark:border-slate-800"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <h2 id="how-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
              {d.howTitle}
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              {d.how.map((step) => (
                <li key={step.step}>
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold"
                    style={{
                      background: "color-mix(in srgb, var(--brand-accent) 14%, transparent)",
                      color: "var(--brand-accent)",
                    }}
                  >
                    {step.step}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Real tours (only once one is live) ───────────────────────── */}
        {showcase.length ? (
          <section aria-labelledby="showcase-heading" className="border-b border-slate-200 dark:border-slate-800">
            <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
              <h2 id="showcase-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
                {d.showcaseTitle}
              </h2>
              <p className="mt-4 max-w-xl leading-relaxed text-slate-600 dark:text-slate-400">{d.showcaseIntro}</p>
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {showcase.map((listing) => (
                  <li key={listing.slug}>
                    <ListingCard listing={listing} dict={dict} lang={lang} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ── The embed ────────────────────────────────────────────────── */}
        <section
          aria-labelledby="embed-heading"
          className="border-b border-slate-200 dark:border-slate-800"
          style={{ background: "color-mix(in srgb, var(--brand-accent) 5%, transparent)" }}
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-20">
            <div>
              <h2
                id="embed-heading"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
              >
                {d.embedTitle}
              </h2>
              <p className="mt-4 max-w-xl leading-relaxed text-slate-600 dark:text-slate-400">
                {d.embedIntro}
              </p>

              <ol className="mt-8 flex flex-col gap-3">
                {d.embedSteps.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background: "color-mix(in srgb, var(--brand-accent) 14%, transparent)",
                        color: "var(--brand-accent)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-6 max-w-full">
                <CopyButton value={SNIPPET} label={d.embedSnippetLabel} />
                {/* slate-600 over the tinted band: slate-500 measures 4.44:1 here. */}
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  {d.embedSnippetNote}
                </p>
              </div>
            </div>

            <EmbedMock label={d.embedPreviewLabel} barCta={d.embedPreviewBar} />
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section
          aria-labelledby="features-heading"
          className="border-b border-slate-200 dark:border-slate-800"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
            <h2
              id="features-heading"
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {d.featuresLabel}
            </h2>
            <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {d.features.map((f) => (
                <li key={f.title}>
                  <span
                    aria-hidden="true"
                    className="block h-1 w-10 rounded-full"
                    style={{ background: "var(--brand-accent)" }}
                  />
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {f.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── What's included + pricing ────────────────────────────────── */}
        <section
          aria-labelledby="included-heading"
          className="border-b border-slate-200 dark:border-slate-800"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
            <div>
              <h2
                id="included-heading"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
              >
                {d.includedTitle}
              </h2>
              <ul className="mt-8 flex flex-col gap-3">
                {d.included.map((item) => (
                  <li key={item} className="flex gap-3 text-sm">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="mt-0.5 h-5 w-5 shrink-0 fill-none stroke-2"
                      style={{ stroke: "var(--brand-accent)" }}
                    >
                      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-slate-700 dark:text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800 lg:p-8">
              <h3 className="text-xl font-semibold">{d.pricingTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {d.pricingBody}
              </p>
              <p className="mt-6">
                <SolidCta href="https://witus.online">{d.contactCta}</SolidCta>
              </p>
            </div>
          </div>
        </section>

        {/* ── Status ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <p
            className="inline-flex min-h-9 items-center rounded-full px-4 text-xs font-semibold uppercase tracking-wide"
            style={{
              background: "color-mix(in srgb, var(--brand-accent) 14%, transparent)",
              color: "var(--brand-accent)",
            }}
          >
            {d.statusBadge}
          </p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            {d.statusBody}
          </p>
          <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <SolidCta href={`https://${DEMO_HOST}`}>{d.ctaPrimary}</SolidCta>
            <Link
              href={`/${lang}/roadmap`}
              className={`inline-flex min-h-11 items-center font-semibold underline underline-offset-4 ${FOCUS}`}
              style={{ color: "var(--brand-accent)" }}
            >
              {d.roadmapCta}
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter lang={lang} />
    </>
  );
}
