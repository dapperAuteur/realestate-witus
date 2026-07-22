import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/locales";

// The Stay.WitUS product landing, shown on platform hosts (stay.witus.online,
// vercel.app previews, localhost) while tenant features are built out.
// Copy is a working draft — BAM reviews and owns the words before any
// marketing push (content rule: humans own what customers read).

export function PlatformLanding({
  dict,
  lang,
  promoBanner,
}: {
  dict: Dictionary;
  lang: Locale;
  promoBanner?: string | null;
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
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-16">
      <header className="flex flex-col gap-4">
        <p
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--brand-accent)" }}
        >
          Stay.WitUS
        </p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{d.headline}</h1>
        <p className="max-w-xl text-lg text-slate-600 dark:text-slate-400">{d.subhead}</p>
      </header>

      <section aria-labelledby="features-heading" className="mt-12">
        <h2 id="features-heading" className="sr-only">
          {d.featuresLabel}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {d.features.map((f) => (
            <li
              key={f.title}
              className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <p
          className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {d.statusBadge}
        </p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{d.statusBody}</p>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <a
            href="https://demo.stay.witus.online"
            className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {d.demoCta}
          </a>
          <Link
            href={`/${lang}/roadmap`}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
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
