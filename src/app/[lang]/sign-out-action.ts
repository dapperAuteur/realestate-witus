"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, hasAuth } from "@/lib/auth";
import { env, witusEndSessionEndpoint } from "@/lib/env";
import { withPostLogoutRedirect } from "@/lib/silent-sso";
import { witusEcosystemEnabled } from "@/lib/witus-sso";

/**
 * GLOBAL SIGN-OUT on the WitUS-branded platform host, purely local everywhere else.
 *
 * BAM's decision (2026-08-30): signing out of one WitUS app signs you out of all of
 * them. Ending only the local session leaves the IdP session alive, which — now that
 * the sign-in page offers "Continue as ..." — means signing out and coming back
 * offers to sign you straight back in, and reads as a broken logout.
 *
 * ON AN AGENCY TENANT DOMAIN THIS STAYS ENTIRELY LOCAL. witusEcosystemEnabled is the
 * SAME gate that hides the sign-in button (src/lib/witus-sso.ts), resolved on the
 * server from the request Host, never from anything the form posted. An agency's staff
 * must not be redirected to accounts.witus.online on their way out any more than on
 * their way in: one request reveals the ecosystem exists and tells it someone visited
 * that agency. `lang` is the only client-supplied value here and it decides nothing
 * beyond which local page the local path returns to.
 */
export async function signOutAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");

  if (hasAuth()) {
    await auth()
      .api.signOut({ headers: await headers() })
      .catch(() => null);
  }

  // ORDER IS THE SAFETY PROPERTY. The local session is destroyed above, so if the IdP
  // is unreachable or refuses the logout, the person is still signed out HERE. Never
  // hand off first and destroy locally afterwards: that turns any IdP failure into
  // "I clicked sign out and I am still signed in".
  if (await witusEcosystemEnabled()) {
    // The redirect target is built from BETTER_AUTH_URL, the same value the gate
    // derives the branded host from, so post_logout_redirect_uri is exactly the
    // `origin + "/"` the IdP registry recorded for slug `realestate` — in production,
    // https://realestate.witus.online/. Trailing slash included; Better Auth
    // exact-matches it. That "/" then 307s to "/en" here (src/middleware.ts), which is
    // the intended shape: the locale belongs to this app, not to the IdP's registry.
    const endSession = withPostLogoutRedirect(witusEndSessionEndpoint, env.BETTER_AUTH_URL);
    // A full navigation off this origin, which is what a server-action redirect to an
    // absolute URL performs. Null means this app is not a configured OIDC client (or
    // BETTER_AUTH_URL is unusable), and sign-out falls back to today's local behaviour
    // rather than navigating somewhere invented.
    if (endSession) redirect(endSession);
  }

  redirect(`/${lang}`);
}
