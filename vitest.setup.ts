// Vitest runs outside Next, so local env files are loaded here. Real env vars
// win over file values (Node semantics), matching drizzle.config.ts's loader.
// Integration suites skip themselves when no database URL is present.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File absent (CI) — fine.
  }
}

// Test-only fallbacks so the integration suites can run without production
// secrets (they still need the database URL to do anything).
//
// EMPTY counts as unset: a key can be declared in .env.local with no value
// yet, and `??=` would happily keep the empty string and fail deep inside
// Better Auth instead of here.
function fallback(key: string, value: string): void {
  if (!process.env[key]) process.env[key] = value;
}

fallback("BETTER_AUTH_SECRET", "vitest-only-secret-never-production");
fallback("BETTER_AUTH_URL", "http://localhost:3000");
// Only used to build delivery URLs (pure string work, no network), so the
// support attachment assertions stay deterministic wherever they run.
fallback("CLOUDINARY_CLOUD_NAME", "vitest-cloud");
// The rename/destroy tests sign requests with the key and secret and check the signature; they use a
// fake fetch, so nothing reaches Cloudinary. Kept here (not in CI) so tests pass the same everywhere.
fallback("CLOUDINARY_API_KEY", "vitest-api-key");
fallback("CLOUDINARY_API_SECRET", "vitest-api-secret");

// Tests must NEVER send real email: strip Mailgun creds (now present in
// .env.local) so the mailer always uses its console dev-log fallback — the
// magic-link tests capture links from that log, and real sends to
// itest-*@example.com would burn sender reputation.
delete process.env.MAILGUN_API_KEY;
delete process.env.MAILGUN_DOMAIN;
