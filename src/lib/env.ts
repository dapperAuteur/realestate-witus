import {
  endSessionEndpointFromDiscovery,
  silentSsoEndpointFromDiscovery,
} from "@/lib/silent-sso";

// Central env access. Never read .env files in tooling; values come from
// process.env (Vercel env / local .env loaded by Next).

export const env = {
  // Neon via the Vercel Marketplace integration with the "STORAGE_" prefix
  // (BAM's setup). Plain DATABASE_URL is the fallback for local dev or a
  // manually provisioned database — verify the exact names in Vercel's env
  // list rather than assuming (authoritative-values rule).
  DATABASE_URL: process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,

  MAILGUN_API_KEY: process.env.MAILGUN_API_KEY,
  MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN,
  MAILGUN_REGION: process.env.MAILGUN_REGION ?? "us",
  MAIL_FROM: process.env.MAIL_FROM ?? "RealEstate.WitUS <no-reply@localhost>",

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  PLATFORM_MOMO_NUMBER: process.env.PLATFORM_MOMO_NUMBER,
  PLATFORM_MOMO_NAME: process.env.PLATFORM_MOMO_NAME,

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  VERCEL_DOMAINS_TOKEN: process.env.VERCEL_DOMAINS_TOKEN,
  VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,

  // "Sign in with WitUS" — ecosystem OIDC client against accounts.witus.online.
  // Registered as slug `realestate` in gemini/witus/lib/identity/clients.ts, whose ONLY
  // redirect URI is https://realestate.witus.online/api/auth/oauth2/callback/witus. That
  // single registration is deliberate: see shouldShowWitusSignIn in src/lib/witus-sso.ts.
  // Unset on every deployment until BAM provisions them (plans/user-tasks/09), and unset
  // is the safe state — hasWitusSso goes false and every ecosystem surface stays dark.
  WITUS_OIDC_CLIENT_ID: process.env.WITUS_OIDC_CLIENT_ID,
  WITUS_OIDC_CLIENT_SECRET: process.env.WITUS_OIDC_CLIENT_SECRET,
  WITUS_OIDC_DISCOVERY_URL: process.env.WITUS_OIDC_DISCOVERY_URL,

  WITUS_INBOX_URL: process.env.WITUS_INBOX_URL,
  WITUS_INBOX_HMAC_SECRET: process.env.WITUS_INBOX_HMAC_SECRET,
  OUTBOX_URL: process.env.OUTBOX_URL,
  OUTBOX_HMAC_SECRET: process.env.OUTBOX_HMAC_SECRET,
  OUTBOX_TRIGGER_ENABLED: process.env.OUTBOX_TRIGGER_ENABLED === "true",

  CRON_SECRET: process.env.CRON_SECRET,

  // Error monitoring (Better Stack, ingesting over the Sentry protocol). All three are optional:
  // with no DSN the SDK never initializes and the app behaves exactly as it did before. The
  // sentry.*.config.ts files read process.env directly, since they load before app code and the
  // public DSN has to stay a literal process.env.NEXT_PUBLIC_* read for Next to inline it.
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,

  // Demo logins. Emails identify the two demo accounts; passwords are
  // server-held — the demo buttons POST a role only and /api/demo-login
  // supplies the credential, so the secret never reaches a browser.
  // Unprefixed by design: only the Neon marketplace vars carry STORAGE_.
  DEMO_VISITOR_USER_EMAIL: process.env.DEMO_VISITOR_USER_EMAIL,
  DEMO_VISITOR_PASSWORD: process.env.DEMO_VISITOR_PASSWORD,
  DEMO_ADMIN_USER_EMAIL: process.env.DEMO_ADMIN_USER_EMAIL,
  DEMO_ADMIN_PASSWORD: process.env.DEMO_ADMIN_PASSWORD,

  ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL,
  PLATFORM_BOOTSTRAP: process.env.PLATFORM_BOOTSTRAP === "true",
} as const;

export const hasDatabase = Boolean(env.DATABASE_URL);
export const hasMailgun = Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
export const hasStripePlatform = Boolean(env.STRIPE_SECRET_KEY);
export const hasVercelDomains = Boolean(env.VERCEL_DOMAINS_TOKEN && env.VERCEL_PROJECT_ID);
export const hasWitusInbox = Boolean(env.WITUS_INBOX_URL && env.WITUS_INBOX_HMAC_SECRET);
export const hasWitusSso = Boolean(env.WITUS_OIDC_CLIENT_ID && env.WITUS_OIDC_CLIENT_SECRET);
export const hasDemoLogin = Boolean(
  env.DEMO_VISITOR_USER_EMAIL &&
    env.DEMO_VISITOR_PASSWORD &&
    env.DEMO_ADMIN_USER_EMAIL &&
    env.DEMO_ADMIN_PASSWORD,
);

// --- Ecosystem SSO endpoints -------------------------------------------------
//
// Both derive from the ONE discovery URL below, so accounts.witus.online is named in
// exactly one place in this repo and auth.ts re-exports the same literal. Two literals
// that could disagree is how the silent "Continue as ..." check ends up probing a
// different host than the one the click signs in against.
//
// Both are ALSO gated a second time at every call site by showWitusSignIn()
// (src/lib/witus-sso.ts). These constants only answer "is this app a configured OIDC
// client at all"; the host gate is what keeps an agency tenant's buyers off
// accounts.witus.online.

/**
 * Labelled FALLBACK, not an assumed value. The IdP owns this URL, so prefer the env var
 * and treat the literal as a default to override (authoritative-values rule). It is a
 * literal at all because the discovery document is what every other ecosystem app is
 * already configured against, and an app with no WITUS_OIDC_DISCOVERY_URL set but real
 * credentials should work rather than silently derive null endpoints.
 */
export const WITUS_OIDC_DISCOVERY_FALLBACK =
  "https://accounts.witus.online/api/idp/.well-known/openid-configuration";

const witusDiscoveryUrl = env.WITUS_OIDC_DISCOVERY_URL ?? WITUS_OIDC_DISCOVERY_FALLBACK;

/**
 * Where the sign-in page silently asks the IdP who the visitor already is. `null`
 * unless the ecosystem OIDC client is configured, because an affordance the visitor
 * cannot complete is worse than none.
 */
export const witusSilentSsoEndpoint: string | null = hasWitusSso
  ? silentSsoEndpointFromDiscovery(witusDiscoveryUrl)
  : null;

/**
 * Where "Sign out of WitUS everywhere" ends the SHARED WitUS session. The plain
 * "Sign out" never uses this; it ends only this app's session (BAM, 2026-10-29,
 * witus task 128 option (b)).
 *
 * client_id is attached HERE and is REQUIRED: Better Auth rejects
 * post_logout_redirect_uri with `invalid_request` unless the request carries a
 * verifiable id_token_hint or an explicit client_id, and we have no id_token to hand.
 * The post_logout_redirect_uri itself is appended at the call site
 * (withPostLogoutRedirect, src/lib/silent-sso.ts) from BETTER_AUTH_URL.
 */
export const witusEndSessionEndpoint: string | null = (() => {
  if (!hasWitusSso) return null;
  const base = endSessionEndpointFromDiscovery(witusDiscoveryUrl);
  if (!base) return null;
  return `${base}?client_id=${encodeURIComponent(env.WITUS_OIDC_CLIENT_ID as string)}`;
})();
