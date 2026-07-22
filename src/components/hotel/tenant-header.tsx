import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { TenantRecord } from "@/lib/tenant";

/**
 * Slim persistent header on hotel sites (research A3): the name goes home,
 * Book is always one tap away. Renders only on tenant pages — the platform
 * surface keeps its own chrome.
 */
export function TenantHeader({
  tenant,
  dict,
  lang,
}: {
  tenant: TenantRecord;
  dict: Dictionary;
  lang: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2">
        <Link
          href={`/${lang}`}
          className="inline-flex min-h-11 items-center text-sm font-bold [font-family:var(--font-heading)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {tenant.theme.name ?? tenant.name}
        </Link>
        <nav aria-label={dict.nav.home} className="flex items-center gap-3">
          {tenant.flags.events ? (
            <Link
              href={`/${lang}/events`}
              className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {dict.nav.events}
            </Link>
          ) : null}
          <Link
            href={`/${lang}/book`}
            className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {dict.nav.book}
          </Link>
        </nav>
      </div>
    </header>
  );
}
