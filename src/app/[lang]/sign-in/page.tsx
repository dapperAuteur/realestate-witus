import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { resolveTenant } from "@/lib/tenant";
import { requestMagicLink } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

// Magic-link sign-in for staff. Plain form + server action: works without
// client JS, on any tenant domain (the email sends from that agency's own
// sender).

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const s = dict.signIn;
  const { status } = await searchParams;

  const tenant = await resolveTenant().catch(() => null);
  const brand = tenant?.theme.name ?? tenant?.name ?? "RealEstate.WitUS";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {s.title}
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {s.body} {brand}.
      </p>


      {status === "sent" ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800"
        >
          {s.sent}
        </p>
      ) : (
        <form action={requestMagicLink} className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="lang" value={lang} />
          <label htmlFor="email" className="text-sm font-medium">
            {s.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700 dark:bg-slate-900"
          />
          {status === "invalid" ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {s.invalid}
            </p>
          ) : null}
          {status === "unavailable" ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {s.unavailable}
            </p>
          ) : null}
          <button
            type="submit"
            className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-accent-fg)",
            }}
          >
            {s.submit}
          </button>
        </form>
      )}
    </main>
  );
}
