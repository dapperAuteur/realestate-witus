import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink } from "better-auth/plugins";
import { db, schema } from "@/db";
import { WITUS_OIDC_DISCOVERY_FALLBACK, env, hasWitusSso } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";
import { getTenantByHost } from "@/lib/tenant";

// Product-local Better Auth. Passwordless only: staff arrive by invite and sign
// in by magic link. Lazy singleton so builds without env never construct it.
//
// "Sign in with WitUS" (genericOAuth, below) is available on the WitUS-BRANDED
// platform host ONLY, never on an agency tenant domain — the learnwitus white-label
// precedent, which CLAUDE.md records as "no shared WitUS OIDC for CUSTOMER TENANTS".
// Customer tenants keep tenant-branded magic links, sent from the agency's own domain.
// The gate that decides whether the button renders is src/lib/witus-sso.ts; the IdP
// independently backs it up by registering only the branded host's redirect URI, so a
// tenant host fails closed.

let _auth: ReturnType<typeof buildAuth> | null = null;

function buildAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      additionalFields: {
        // Server-managed; never accepted from sign-up input.
        isPlatformOwner: { type: "boolean", defaultValue: false, input: false },
      },
    },
    // Password sign-IN exists solely for the two demo accounts (the only
    // credential accounts that exist); public sign-UP stays off. Everyone
    // real uses magic links.
    emailAndPassword: { enabled: true, disableSignUp: true },
    // Better Auth's OWN origin check for its endpoints — NOT the ecosystem gate. The
    // wildcard here says nothing about who may use WitUS SSO; src/lib/witus-sso.ts
    // decides that, exact-match against one host. Tenant custom domains get appended
    // here once domain management ships; the wildcard covers *.witus.online tenants
    // and previews today.
    trustedOrigins: [
      "https://realestate.witus.online",
      "https://*.witus.online",
      "http://localhost:3000",
    ],
    plugins: [
      magicLink({
        expiresIn: 60 * 10,
        sendMagicLink: async ({ email, url }, request) => {
          // Per-tenant sender: mail from an agency's domain says the agency,
          // never RealEstate.WitUS (white-label rule).
          const host = request?.headers?.get("host");
          const tenant = host ? await getTenantByHost(host).catch(() => null) : null;
          const brand = tenant?.theme.name ?? tenant?.name ?? "RealEstate.WitUS";
          await sendEmail({
            to: email,
            from: tenant?.email.from,
            replyTo: tenant?.email.replyTo,
            subject: `Sign in to ${brand}`,
            text: [
              `Use this link to sign in to ${brand}:`,
              "",
              url,
              "",
              "The link expires in 10 minutes. If you did not request it, ignore this email.",
            ].join("\n"),
          });
        },
      }),
      // Registering the provider at all is conditional on credentials existing.
      // With none, Better Auth has no `witus` provider, so even a hand-crafted POST to
      // the sign-in action cannot start a flow — the third defence-in-depth layer named
      // in src/lib/witus-sso.ts.
      ...(hasWitusSso
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "witus",
                  clientId: env.WITUS_OIDC_CLIENT_ID as string,
                  clientSecret: env.WITUS_OIDC_CLIENT_SECRET as string,
                  // Labelled fallback, not an assumed value: the IdP owns this URL, so
                  // prefer the env var and treat the literal as a default to override
                  // (authoritative-values rule). The literal itself lives in env.ts
                  // because the silent-SSO probe and the global-sign-out endpoint derive
                  // from the same value — if they ever disagreed, the "Continue as ..."
                  // check would probe a different host than the click signs in against.
                  discoveryUrl: env.WITUS_OIDC_DISCOVERY_URL ?? WITUS_OIDC_DISCOVERY_FALLBACK,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
      // nextCookies() stays LAST. It reads the Set-Cookie headers other plugins produced
      // and writes them through Next's cookie API, so a plugin listed after it would
      // have its cookies dropped.
      nextCookies(),
    ],
  });
}

export function auth(): ReturnType<typeof buildAuth> {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is not set");
  }
  if (!_auth) {
    _auth = buildAuth();
  }
  return _auth;
}

export const hasAuth = () => Boolean(env.BETTER_AUTH_SECRET && env.DATABASE_URL);
