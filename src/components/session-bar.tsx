import Link from "next/link";
import { signOutAction, signOutEverywhereAction } from "@/app/[lang]/sign-out-action";
import type { Dictionary } from "@/lib/dictionaries";
import { getMembership, getSessionUser } from "@/lib/rbac";
import { roleSatisfies } from "@/lib/rbac";
import { resolveTenant } from "@/lib/tenant";
import { witusEverywhereSignOutUrl } from "@/lib/sign-out";

// Signed-in indicator + the door to the next surface (BAM: users could not
// tell they were logged in or where admin lives). Renders NOTHING for
// signed-out visitors — public pages stay clean; sign-in lives in the footer.

// Fixed id: the session bar renders once per page.
const EVERYWHERE_HELP_ID = "sign-out-everywhere-help";

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
  // The platform host's admin holds BAM's own service listings: his alone.
  const isPlatformAdmin = Boolean(tenant?.flags.platform && user.isPlatformOwner);
  const showAdmin = isPlatformAdmin || Boolean(staffRole && roleSatisfies(staffRole, "agent"));
  const showPlatform = user.isPlatformOwner && !isTenantSite;
  // "Sign out" always ends only this app's session and is always labelled "Sign out".
  // "Sign out of WitUS everywhere" is a second control, offered only where the
  // everywhere URL resolves: the WitUS-branded platform host of a configured ecosystem
  // client. On an agency tenant domain it is null, so nothing here names WitUS. The
  // same function decides the action's redirect, so control and behaviour cannot
  // diverge (BAM, 2026-10-29, witus task 128 option (b)).
  const offerEverywhere = (await witusEverywhereSignOutUrl().catch(() => null)) !== null;

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
              {isPlatformAdmin ? c.serviceAdminLink : c.adminLink}
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
        {offerEverywhere ? (
          <form
            action={signOutEverywhereAction}
            className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-1"
          >
            <input type="hidden" name="lang" value={lang} />
            <p
              id={EVERYWHERE_HELP_ID}
              className="max-w-md text-right text-slate-600 dark:text-slate-400"
            >
              {c.signOutEverywhereHelp}
            </p>
            <button
              type="submit"
              aria-describedby={EVERYWHERE_HELP_ID}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {c.signOutEverywhere}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
