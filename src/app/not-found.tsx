import Link from "next/link";

/** Root 404: URLs that never matched a route (outside /[lang]). */
export default function RootNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        404
      </p>
      <h1 className="text-2xl font-bold">There is no page here</h1>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-11 items-center rounded-full border border-slate-300 px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
      >
        Back to home
      </Link>
    </main>
  );
}
