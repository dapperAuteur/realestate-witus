/**
 * Route-level pending state (ecosystem rule). Client boundary, so no
 * getDictionary here; the visible text is an sr-only literal.
 */
export default function Loading() {
  return (
    <main
      role="status"
      className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6"
    >
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-transparent motion-reduce:animate-none dark:border-slate-600"
      />
      <span className="sr-only">Loading</span>
    </main>
  );
}
