import { readFileSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

// Plain "Sign out" ends ONLY this app's session (BAM, 2026-10-29, witus task 128 option (b)).
//
// better-auth 1.7 made RP-initiated logout the default for every genericOAuth provider: on
// signOut() it answers with the IdP's end_session_endpoint (plus id_token_hint) and the client
// follows it. That stranded people on accounts.witus.online/api/idp/oauth2/endsession and ended
// the shared WitUS session (BAM, 2026-10-31). `disableProviderLogout: true` on the witus
// provider turns that off; "Sign out of WitUS everywhere" does its own handoff. Two halves:
//
//   1. THE CONFIG. src/lib/auth.ts keeps `disableProviderLogout: true` inside the witus provider
//      block. Remove it and this file fails.
//   2. THE BEHAVIOR, against the installed better-auth. A throwaway in-memory instance signs a
//      user with a linked witus account (carrying an id_token) out; the response must clear the
//      session cookie and carry no provider-logout URL or Location header. A control case
//      WITHOUT the flag must produce the end-session URL, so a library change that makes the
//      first case pass vacuously is caught here.

/** Assertions about what the CODE does must not be satisfied (or broken) by a comment. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The object literal that holds `providerId: "witus"`, from its opening to its closing brace. */
function witusProviderBlock(src: string): string {
  const start = src.indexOf('providerId: "witus"');
  if (start === -1) return "";
  const open = src.lastIndexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    if (src[i] === "}") depth -= 1;
    if (depth === 0) return src.slice(open, i + 1);
  }
  return "";
}

const BASE = "http://localhost:3000";

async function signOutOnce(disableProviderLogout: boolean) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: BASE,
    secret: "sign-out-local-only-test-secret-not-real",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: "witus",
            authorizationUrl: "https://idp.invalid/authorize",
            tokenUrl: "https://idp.invalid/token",
            endSessionEndpoint: "https://idp.invalid/endsession",
            clientId: "test-client",
            clientSecret: "test-secret",
            ...(disableProviderLogout ? { disableProviderLogout: true } : {}),
          },
        ],
      }),
    ],
  });
  const { headers, response } = await auth.api.signUpEmail({
    body: { email: "person@example.invalid", password: "a-long-test-password", name: "Person" },
    returnHeaders: true,
  });
  const ctx = await auth.$context;
  await ctx.internalAdapter.createAccount({
    userId: response.user.id,
    providerId: "witus",
    accountId: "witus-sub-1",
    idToken: "header.payload.signature",
  });
  const cookie = (headers.get("set-cookie") ?? "").split(";")[0];
  const res = await auth.handler(
    new Request(`${BASE}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie, origin: BASE, "content-type": "application/json" },
      body: "{}",
    }),
  );
  return {
    cookie,
    status: res.status,
    location: res.headers.get("location"),
    setCookie: res.headers.get("set-cookie") ?? "",
    body: (await res.json()) as { success?: boolean; url?: string; redirect?: boolean },
    sessionsLeft: db.session.length,
  };
}

describe('"Sign out" never hands off to the WitUS IdP (better-auth 1.7 provider logout)', () => {
  it("src/lib/auth.ts sets disableProviderLogout: true on the witus provider", () => {
    const src = stripComments(readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf-8"));
    const block = witusProviderBlock(src);
    expect(block, "no witus provider block found").not.toBe("");
    expect(block).toMatch(/\bdisableProviderLogout:\s*true\b/);
  });

  it("with the flag, sign-out clears the session cookie and returns no provider-logout URL", async () => {
    const r = await signOutOnce(true);
    expect(r.cookie).toMatch(/^better-auth\.session_token=/);
    expect(r.status).toBe(200);
    expect(r.setCookie).toMatch(/better-auth\.session_token=;[^,]*Max-Age=0/);
    expect(r.sessionsLeft).toBe(0);
    expect(r.location).toBeNull();
    expect(r.body.url).toBeUndefined();
    expect(r.body.redirect).toBeFalsy();
  });

  it("control: without the flag, better-auth 1.7 returns the IdP end-session URL", async () => {
    const r = await signOutOnce(false);
    expect(r.body.url).toMatch(/^https:\/\/idp\.invalid\/endsession/);
  });
});
