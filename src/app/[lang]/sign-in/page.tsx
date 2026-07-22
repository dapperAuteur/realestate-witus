import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { DEMO_TENANT_SLUG } from "@/lib/demo/seed";
import { hasDemoLogin } from "@/lib/env";
import { resolveTenant } from "@/lib/tenant";
import { requestMagicLink } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

// Magic-link sign-in for staff, partners, and stay accounts. Plain form +
// server action: works without client JS, on any tenant domain (the email
// sends from that hotel's own sender).

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
  const brand = tenant?.theme.name ?? tenant?.name ?? "Stay.WitUS";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {s.title}
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {s.body} {brand}.
      </p>

      {hasDemoLogin && tenant?.slug === DEMO_TENANT_SLUG ? (
        <section
          aria-label={s.demoHeading}
          className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
        >
          <h2 className="text-sm font-semibold">{s.demoHeading}</h2>
          <p className="mt-1 text-xs text-slate-500">{s.demoHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form method="post" action="/api/demo-login">
              <input type="hidden" name="role" value="admin" />
              <input type="hidden" name="lang" value={lang} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
              >
                {s.demoAdmin}
              </button>
            </form>
            <form method="post" action="/api/demo-login">
              <input type="hidden" name="role" value="visitor" />
              <input type="hidden" name="lang" value={lang} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700"
              >
                {s.demoVisitor}
              </button>
            </form>
          </div>
        </section>
      ) : null}

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
