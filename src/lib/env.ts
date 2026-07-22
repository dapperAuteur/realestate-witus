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
  MAIL_FROM: process.env.MAIL_FROM ?? "Stay.WitUS <no-reply@localhost>",

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

  WITUS_INBOX_URL: process.env.WITUS_INBOX_URL,
  WITUS_INBOX_HMAC_SECRET: process.env.WITUS_INBOX_HMAC_SECRET,
  OUTBOX_URL: process.env.OUTBOX_URL,
  OUTBOX_HMAC_SECRET: process.env.OUTBOX_HMAC_SECRET,
  OUTBOX_TRIGGER_ENABLED: process.env.OUTBOX_TRIGGER_ENABLED === "true",

  CRON_SECRET: process.env.CRON_SECRET,

  // BAM Hotel demo logins (plans/07). Emails identify the two demo accounts;
  // passwords are server-held — the demo buttons POST empty bodies and the
  // route supplies credentials, so secrets never reach a browser.
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
export const hasDemoLogin = Boolean(
  env.DEMO_VISITOR_USER_EMAIL &&
    env.DEMO_VISITOR_PASSWORD &&
    env.DEMO_ADMIN_USER_EMAIL &&
    env.DEMO_ADMIN_PASSWORD,
);
