"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, hasAuth } from "@/lib/auth";
import { witusEverywhereSignOutUrl } from "@/lib/sign-out";

/**
 * Two sign-out actions (BAM, 2026-10-29, witus task 128 option (b)):
 *
 *   - `signOutAction` ("Sign out") ends ONLY this app's session and returns to the
 *     local home page. It never touches the IdP, on any host. Other WitUS apps and the
 *     WitUS session itself stay signed in, so the next "Sign in with WitUS" goes
 *     straight through.
 *   - `signOutEverywhereAction` ("Sign out of WitUS everywhere") ends this app's
 *     session AND the shared WitUS session at the IdP. It is offered only on the
 *     WitUS-branded platform host. After the IdP the visitor lands on `origin + "/"`,
 *     which 307s to "/en" here (src/middleware.ts): the locale belongs to this app,
 *     not to the IdP's registry.
 *
 * This replaces the 2026-08-30 behaviour where the one plain button also ended the
 * WitUS session: that left every other app signed in while silently ending WitUS,
 * which surprised BAM.
 */

/** Ends this app's Better Auth session. Awaited, and its failure swallowed. */
async function endLocalSession(): Promise<void> {
  if (!hasAuth()) return;
  await auth()
    .api.signOut({ headers: await headers() })
    .catch(() => null);
}

/** "Sign out": this app only. Never navigates to the IdP. */
export async function signOutAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  await endLocalSession();
  redirect(`/${lang}`);
}

/**
 * "Sign out of WitUS everywhere": this app, then the shared WitUS session.
 *
 * ON AN AGENCY TENANT DOMAIN THIS STAYS ENTIRELY LOCAL, even though a server action is a
 * public POST endpoint anyone can call from any host. witusEverywhereSignOutUrl uses
 * the SAME gate that hides the sign-in button (witusEcosystemEnabled, src/lib/witus-sso.ts),
 * resolved on the server from the request Host, never from anything the form posted.
 * An agency's staff must not be redirected to accounts.witus.online on their way out any
 * more than on their way in: one request reveals the ecosystem exists and tells it
 * someone visited that agency. `lang` is the only client-supplied value here and it
 * decides nothing beyond which local page the local path returns to.
 */
export async function signOutEverywhereAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");

  await endLocalSession();

  // ORDER IS THE SAFETY PROPERTY. The local session is destroyed above, so if the IdP
  // is unreachable or refuses the logout, the person is still signed out HERE. Never
  // hand off first and destroy locally afterwards: that turns any IdP failure into
  // "I clicked sign out and I am still signed in".
  const endSession = await witusEverywhereSignOutUrl();
  // A full navigation off this origin, which is what a server-action redirect to an
  // absolute URL performs. Null means an agency tenant host, or this app is not a configured
  // OIDC client (or BETTER_AUTH_URL is unusable): sign-out stays local rather than
  // navigating somewhere invented.
  if (endSession) redirect(endSession);

  redirect(`/${lang}`);
}
