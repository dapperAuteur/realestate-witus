"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  SILENT_SSO_TIMEOUT_MS,
  SSO_ATTEMPT_STORAGE_KEY,
  continueAsLabel,
  runSilentSsoProbe,
  type SsoIdentity,
} from "@/lib/silent-sso";

/**
 * The submit button of the "Sign in with WitUS" form, plus the silent
 * "Continue as <name>" check layered on top of it.
 *
 * PROGRESSIVE ENHANCEMENT, NOT A REPLACEMENT. The parent is still the plain
 * `<form action={signInWithWitus}>` server-action form it was before, and this is
 * still a `type="submit"` button inside it — so the ecosystem flow keeps working
 * with client JS off, which is the property the whole sign-in page is built around.
 * All this component adds is a better label and the loop-guard marker.
 *
 * THE GATE IS THE WHOLE POINT. `enabled` is resolved on the SERVER from the request
 * host (showWitusSignIn, src/lib/witus-sso.ts) and is never derived here or supplied
 * by the client. An agency tenant's buyer must never so much as touch
 * accounts.witus.online: that single request would both reveal the ecosystem exists
 * and tell it someone visited that agency. The sign-in page already renders this
 * component only behind the gate and only passes `silentCheckUrl` there; `enabled`
 * repeats it as a hard precondition so a future caller who forgets the wrapper gets
 * an inert button rather than a leak.
 *
 * WHAT THE VISITOR SEES. The form is already on screen; nothing here delays it. The
 * button reads "Sign in with WitUS" from first paint. If the probe finds a WitUS
 * session it becomes "Continue as <name>". If the probe fails, times out, or the
 * browser blocks third-party cookies, nothing changes and nothing is said — a failed
 * silent check is invisible.
 */
export function WitusSignInButton({
  enabled,
  silentCheckUrl,
  signedIn = false,
  copy,
}: {
  /** Server-resolved host gate. False means this component asks nothing of anyone. */
  enabled: boolean;
  /** IdP session endpoint, or null when ecosystem SSO is not configured. */
  silentCheckUrl: string | null;
  /** Already signed in here, so there is nothing to ask on anyone's behalf. */
  signedIn?: boolean;
  copy: {
    signIn: string;
    continueAs: string;
    redirecting: string;
    notYou: string;
  };
}) {
  const { pending } = useFormStatus();
  const [identity, setIdentity] = useState<SsoIdentity | null>(null);

  useEffect(() => {
    // Abort rather than hang. A probe still in flight when the visitor has moved on
    // is a leak of attention, not just of a socket.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SILENT_SSO_TIMEOUT_MS);
    let live = true;

    void runSilentSsoProbe({
      enabled,
      endpoint: silentCheckUrl,
      search: window.location.search,
      attempted: readAttempted(),
      signedIn,
      fetchImpl: fetch,
      signal: controller.signal,
    })
      .then((found) => {
        // NEVER a credential. This name is display copy for a button whose submit
        // runs the real OIDC code flow (and whose server action re-checks the host
        // gate). It grants nothing on its own.
        if (live && found) setIdentity(found);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, silentCheckUrl, signedIn]);

  if (!enabled) return null;

  const label = pending ? copy.redirecting : continueAsLabel(identity, copy);

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        // THE LOOP GUARD, written BEFORE the form submits, never after the return.
        // Without it a visitor whose IdP session has gone stale gets: probe says
        // "Continue as X" -> submit -> the IdP cannot finish -> back to sign-in ->
        // probe says "Continue as X" -> forever. With it, one attempt per tab; the
        // second render offers the plain button and the email form, which always work.
        // onClick runs synchronously ahead of the submission, which is what makes
        // "before" true here.
        onClick={writeAttempted}
        className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-60 dark:border-slate-700"
      >
        {label}
      </button>
      {/* Always in the DOM so the label change is announced when it happens, and
          silent (and invisible) when the probe found nothing. */}
      <p
        role="status"
        aria-live="polite"
        className={identity ? "mt-2 text-xs text-slate-500" : "sr-only"}
      >
        {identity ? copy.notYou : ""}
      </p>
    </>
  );
}

/**
 * sessionStorage throws outright in some privacy modes, so both halves are wrapped.
 * A browser that cannot remember the attempt still gets the other half of the guard:
 * the `?sso=tried` marker the auth callback puts on the URL after a decline.
 */
function readAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(SSO_ATTEMPT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAttempted(): void {
  try {
    window.sessionStorage.setItem(SSO_ATTEMPT_STORAGE_KEY, "1");
  } catch {
    // No storage, no marker. The query-param half still applies.
  }
}
