import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";

/**
 * Header for the RealEstate.WitUS platform surface (realestate.witus.online,
 * previews, localhost): every page there that is not an agency tenant site.
 * Agency sites render TenantHeader instead and never see this one
 * (white-label rule).
 *
 * Sign-in control rule (witus docs/shared-ui-ux-dx.md, "Sign-in control"):
 * a signed-out visitor always sees a link named exactly "Sign in" that goes to
 * this app's own sign-in page. It is a plain link: no WitUS IdP request, no
 * WitUS button. Signed in, the auth slot is left to SessionBar, which renders
 * directly above this header with "Signed in as" and "Sign out", so the page
 * never shows two Sign out controls.
 *
 * 320px: the brand and Sign in always fit; Roadmap hides below sm (the
 * landing body and the footer both link to it).
 */
export function PlatformHeader({
  lang,
  dict,
  signedIn,
}: {
  lang: string;
  dict: Dictionary;
  signedIn: boolean;
}) {
  const c = dict.common;
  return (
    <header className="border-b border-slate-200 bg-white print:hidden dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-1">
        <Link
          href={`/${lang}`}
          className="inline-flex min-h-11 shrink-0 items-center rounded text-sm font-extrabold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {c.brand}
        </Link>
        <nav aria-label={c.primaryNav} className="flex items-center gap-1 sm:gap-3">
          <Link
            href={`/${lang}/roadmap`}
            className="hidden min-h-11 items-center rounded px-2 text-sm font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:inline-flex"
          >
            {c.roadmapLink}
          </Link>
          {signedIn ? null : (
            <Link
              href={`/${lang}/sign-in`}
              className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {c.signIn}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
