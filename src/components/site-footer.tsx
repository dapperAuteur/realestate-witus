import Link from "next/link";
import type { Locale } from "@/lib/locales";

// Ecosystem footer per gemini/witus/public/brand/footer-recipe.md, swapped to
// this app's palette (slate neutrals, emerald accent, dark mode). PLATFORM
// SURFACE ONLY: hotel tenant pages never render it (white-label rule — same
// as the recipe's FlashLearnAI white-label note). The Rise Wellness copy and
// disclaimer are verbatim from the recipe; only the app-name token changed.

interface SiblingProduct {
  name: string;
  href: string;
}

// Canonical sibling-product list. Mirror with gemini/witus/lib/products.ts.
const SIBLING_PRODUCTS: SiblingProduct[] = [
  { name: "WitUS.online", href: "https://witus.online" },
  { name: "WitUS Inbox", href: "https://inbox.witus.online" },
  { name: "CentenarianOS", href: "https://centenarianos.com" },
  { name: "Work.WitUS", href: "https://work.witus.online" },
  { name: "Tour Manager OS", href: "https://tour.witus.online" },
  { name: "Wanderlearn", href: "https://wanderlearn.witus.online" },
  { name: "Fly.WitUS", href: "https://fly.witus.online" },
  { name: "FlashLearnAI", href: "https://flashlearnai.witus.online" },
  { name: "Learn.WitUS", href: "https://centenarianos.com/academy" },
  { name: "AwesomeWebStore", href: "https://awesomewebstore.com" },
];

const linkClasses =
  "inline-flex items-center min-h-7 text-slate-600 hover:text-emerald-700 hover:underline transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 rounded dark:text-slate-400 dark:hover:text-emerald-400";

export function SiteFooter({ lang }: { lang: Locale }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG; next/image adds nothing here */}
          <img
            src="/brand/witus/logomark.svg"
            alt="WitUS"
            width={56}
            height={56}
            className="mb-2 h-12 w-auto"
          />
          <p className="font-extrabold text-slate-900 dark:text-slate-100">
            Stay.WitUS
          </p>
          <p className="text-xs text-slate-500">
            Hotel websites that take bookings themselves
          </p>
        </div>

        <RiseWellnessCallout />

        <div className="grid grid-cols-1 gap-8 text-sm sm:grid-cols-3">
          <div>
            <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Ecosystem
            </p>
            <ul className="space-y-1">
              {SIBLING_PRODUCTS.map((p) => (
                <li key={p.href}>
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClasses}
                  >
                    {p.name}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Stay.WitUS
            </p>
            <ul className="space-y-1">
              <li>
                <Link href={`/${lang}`} className={linkClasses}>
                  Home
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/roadmap`} className={linkClasses}>
                  Roadmap
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/sign-in`} className={linkClasses}>
                  Sign in
                </Link>
              </li>
              <li>
                {/* 404s for non-owners; the door BAM asked for. */}
                <Link href={`/${lang}/platform`} className={linkClasses}>
                  Platform admin
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Partners &amp; Legal
            </p>
            <ul className="space-y-1">
              <li>
                <a
                  href="https://www.centenarianos.com/safety#rise-wellness"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClasses}
                >
                  Rise Wellness
                  <span className="sr-only">
                    {" "}
                    (mental-health partner — opens in new tab)
                  </span>
                </a>
                <p className="text-xs leading-tight text-slate-500 dark:text-slate-400">
                  Mental-health partner
                </p>
              </li>
              <li className="pt-2">
                <a
                  href="https://witus.online/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClasses}
                >
                  Terms
                </a>
              </li>
              <li>
                <a
                  href="https://witus.online/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClasses}
                >
                  Privacy
                </a>
              </li>
              <li>
                <a href="mailto:bam@awews.com" className={linkClasses}>
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6 text-center text-xs text-slate-500 dark:border-slate-900">
          <p>
            © {year} B4C LLC — A{" "}
            <a
              href="https://awesomewebstore.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-emerald-700 hover:underline dark:text-slate-400 dark:hover:text-emerald-400"
            >
              AwesomeWebStore.com
              <span className="sr-only"> (opens in new tab)</span>
            </a>{" "}
            brand
          </p>
        </div>
      </div>
    </footer>
  );
}

// Canonical copy from footer-recipe.md. The disclaimer below is vetted with
// the partner: edit ONLY the app name token, never paraphrase/trim/reorder.
function RiseWellnessCallout() {
  return (
    <section
      aria-labelledby="rise-wellness-heading"
      className="mb-8 rounded-lg border border-emerald-100 bg-emerald-50/60 p-5 text-sm dark:border-emerald-900 dark:bg-emerald-950/40"
    >
      <header className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Mental health support
        </p>
        <h2
          id="rise-wellness-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Rise Wellness of Indiana
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Independent mental health provider · Not affiliated with Stay.WitUS
        </p>
      </header>

      <p className="leading-relaxed text-slate-700 dark:text-slate-300">
        Rise Wellness of Indiana provides compassionate, personalized, holistic
        mental health care: evidence-based medicine, trauma-informed care, and
        a whole-person approach to help you heal, grow, and thrive in mind,
        body, and spirit.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Services
          </p>
          <ul className="space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
            <li>ADHD testing &amp; management (in-person and from home)</li>
            <li>Anxiety &amp; depression</li>
            <li>Maternal mental health</li>
            <li>Medication management</li>
            <li>GeneSight® genetic testing</li>
            <li>Behavioral therapy &amp; coaching</li>
            <li>Routine lab testing</li>
          </ul>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Visit or call
          </p>
          <address className="text-xs not-italic leading-relaxed text-slate-700 dark:text-slate-300">
            320 North Meridian Street
            <br />
            Indianapolis, IN 46204
            <br />
            Mon–Sat by appointment · Sun closed
          </address>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs">
            <a
              href="tel:+13179650299"
              className="inline-flex min-h-7 items-center rounded font-medium text-emerald-700 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400"
            >
              317-965-0299
            </a>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <a
              href="https://risewellnessofindiana.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center rounded font-medium text-emerald-700 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400"
            >
              risewellnessofindiana.com
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <a
              href="https://www.centenarianos.com/safety#rise-wellness"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center rounded font-medium text-emerald-700 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400"
            >
              Full safety page
              <span className="sr-only"> on centenarianos.com (opens in new tab)</span>
            </a>
          </div>
        </div>
      </div>

      <blockquote className="mt-4 border-l-2 border-emerald-300 pl-3 text-xs italic text-slate-600 dark:border-emerald-700 dark:text-slate-400">
        &ldquo;At Rise Wellness, we believe everyone has the capacity to rise
        above challenges and live a fulfilling, healthy life. Our care is
        guided by the belief that healing is personal, holistic, and rooted in
        compassion.&rdquo;
        <span className="mt-1 block not-italic text-slate-500">
          Rise Wellness of Indiana
        </span>
      </blockquote>

      {/* === NON-NEGOTIABLE DISCLAIMER — app-name token only === */}
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Rise Wellness of Indiana is an independent organization. They are not
        affiliated with, employed by, or endorsed by Stay.WitUS, CentenarianOS,
        B4C LLC, AwesomeWebStore.com, or Anthony McDonald. We are grateful for
        their collaboration on mental health safety resources for our
        community.
      </p>
    </section>
  );
}
