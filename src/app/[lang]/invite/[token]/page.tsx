import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { getSessionUser } from "@/lib/rbac";
import { resolveTenant } from "@/lib/tenant";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation" };

// Accept lives on the tenant's own domain. Requires a session (magic link)
// with the invited email; the action enforces the match server-side.

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const a = dict.admin.invite;

  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.flags.platform) notFound();

  const user = await getSessionUser().catch(() => null);
  if (!user) redirect(`/${lang}/sign-in`);

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold [font-family:var(--font-heading)]">
        {a.title}
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {a.body} {tenant.theme.name ?? tenant.name}. {a.signedInAs} {user.email}.
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error === "WRONG_ACCOUNT" ? a.wrongAccount : a.invalid}
        </p>
      ) : null}
      <form action={acceptInviteAction} className="mt-6">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="inline-flex min-h-12 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
        >
          {a.accept}
        </button>
      </form>
    </main>
  );
}
