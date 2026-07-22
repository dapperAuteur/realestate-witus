import type { Dictionary } from "@/lib/dictionaries";

/** Renders the ?ok/?error redirect flags every admin action leaves behind. */
export function Flash({
  ok,
  error,
  dict,
}: {
  ok?: string;
  error?: string;
  dict: Dictionary;
}) {
  const a = dict.admin;
  if (error) {
    const text =
      error in a.errors ? a.errors[error as keyof typeof a.errors] : a.errors.GENERIC;
    return (
      <p
        role="alert"
        className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      >
        {text}
      </p>
    );
  }
  if (ok) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="mb-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
      >
        {ok === "saved" ? a.design.saved : a.ok}
      </p>
    );
  }
  return null;
}
