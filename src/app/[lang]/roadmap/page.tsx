import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { isPlatformHost } from "@/lib/platform-host";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Roadmap" };

// Platform surface only: hotel domains 404 here (their guests should never
// see Stay.WitUS product pages — white-label rule). Copy is a working draft
// derived from the approved build plan; BAM owns the words.

export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const tenant = await resolveTenant().catch(() => null);
  const onPlatform =
    tenant?.flags.platform ||
    (!tenant && isPlatformHost((await headers()).get("host")));
  if (!onPlatform) notFound();

  const r = dict.roadmap;

  return (
    <>
      <main className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
        <header>
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--brand-accent)" }}
          >
            Stay.WitUS
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight">{r.title}</h1>
          <p className="mt-3 max-w-xl text-lg text-slate-600 dark:text-slate-400">
            {r.intro}
          </p>
        </header>

        {r.phases.map((phase) => (
          <section
            key={phase.label}
            aria-labelledby={`phase-${phase.label}`}
            className="mt-12"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`phase-${phase.label}`} className="text-2xl font-bold">
                {phase.label}
              </h2>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--brand-accent)" }}
              >
                {phase.timeframe}
              </p>
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {phase.items.map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-12 text-sm text-slate-600 dark:text-slate-400">
          {r.outro}
        </p>
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}
