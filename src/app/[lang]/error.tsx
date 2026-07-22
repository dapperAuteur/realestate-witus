"use client";

// Route-level error boundary (ecosystem rule). Client boundary: the
// server-only dictionary loader is unavailable here, so this copy is the one
// sanctioned literal-string exception; es lands with the locale workstream.

export default function LangError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p role="alert" className="text-slate-600 dark:text-slate-400">
        The page hit an unexpected error. Nothing was charged. Please try again.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-6 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
