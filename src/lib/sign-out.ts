import { env, witusEndSessionEndpoint } from "@/lib/env";
import { withPostLogoutRedirect } from "@/lib/silent-sso";
import { witusEcosystemEnabled } from "@/lib/witus-sso";

/**
 * Where "Sign out of WitUS everywhere" sends the browser after the local session ends,
 * or null when this request must not offer it (BAM, 2026-10-29, witus task 128
 * option (b)).
 *
 * ONE function decides both whether the control renders (src/components/session-bar.tsx)
 * and whether the action leaves this origin (src/app/[lang]/sign-out-action.ts), so the
 * button and the behaviour cannot diverge. Null on an agency tenant domain: the gate is
 * witusEcosystemEnabled, resolved on the server from the request Host. Null too when
 * this app is not a configured ecosystem OIDC client or BETTER_AUTH_URL is unusable.
 *
 * The return target is built from BETTER_AUTH_URL, the same value the gate derives the
 * branded host from, so post_logout_redirect_uri is exactly the `origin + "/"` the IdP
 * registry recorded for slug `realestate` (in production, https://realestate.witus.online/).
 */
export async function witusEverywhereSignOutUrl(): Promise<string | null> {
  if (!(await witusEcosystemEnabled())) return null;
  return withPostLogoutRedirect(witusEndSessionEndpoint, env.BETTER_AUTH_URL);
}
