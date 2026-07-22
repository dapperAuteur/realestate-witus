import Link from "next/link";
import { signOutAction } from "@/app/[lang]/sign-out-action";
import type { Dictionary } from "@/lib/dictionaries";
import { getMembership, getSessionUser } from "@/lib/rbac";
import { roleSatisfies } from "@/lib/rbac";
import { resolveTenant } from "@/lib/tenant";

// Signed-in indicator + the door to the next surface (BAM: users could not
// tell they were logged in or where admin lives). Renders NOTHING for
// signed-out visitors — guest pages stay clean; sign-in lives in the footer.

export async function SessionBar({
  lang,
  dict,
}: {
  lang: string;
  dict: Dictionary;
}) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return null;
  const c = dict.common;

  const tenant = await resolveTenant().catch(() => null);
  const isTenantSite = Boolean(tenant && !tenant.flags.platform);
  const staffRole =
    isTenantSite && tenant
      ? user.isPlatformOwner
        ? "owner"
        : await getMembership(tenant.id, user.id).catch(() => null)
      : null;
  const showAdmin = Boolean(
    staffRole && roleSatisfies(staffRole, "front_desk"),
  );
  const showPlatform = user.isPlatformOwner && !isTenantSite;

  return (
    <div className="border-b border-slate-200 bg-slate-50 text-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-1.5">
        <p className="text-slate-600 dark:text-slate-400">
          {c.signedInAs} <strong>{user.email}</strong>
        </p>
        <span className="flex flex-wrap items-center gap-3">
          {showAdmin ? (
            <Link
              href={`/${lang}/admin`}
              className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {c.adminLink}
            </Link>
          ) : null}
          {showPlatform ? (
            <Link
              href={`/${lang}/platform`}
              className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {c.platformLink}
            </Link>
          ) : null}
          <form action={signOutAction}>
            <input type="hidden" name="lang" value={lang} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {c.signOut}
            </button>
          </form>
        </span>
      </div>
    </div>
  );
}
