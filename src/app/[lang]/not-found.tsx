import Link from "next/link";

// Catches every notFound() under /[lang] — wrong-role admin visits, unknown
// tenants, bad reservation codes. not-found boundaries receive no params, so
// links go to "/" (middleware sends it to the default locale) and the copy is
// a sanctioned literal-string exception like error.tsx.

export default function LangNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        404
      </p>
      <h1 className="text-2xl font-bold">There is no page here</h1>
      <p className="text-slate-600 dark:text-slate-400">
        The link may be wrong, expired, or for an account with different
        access.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{
            background: "var(--brand-accent, #0f4c81)",
            color: "var(--brand-accent-fg, #ffffff)",
          }}
        >
          Back to home
        </Link>
        <Link
          href="/en/sign-in"
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-6 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
