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

// Test-only auth fallbacks so the Better Auth integration suite can run
// without production secrets (it still needs the database URL to do anything).
process.env.BETTER_AUTH_SECRET ??= "vitest-only-secret-never-production";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

// Tests must NEVER send real email: strip Mailgun creds (now present in
// .env.local) so the mailer always uses its console dev-log fallback — the
// magic-link tests capture links from that log, and real sends to
// itest-*@example.com would burn sender reputation.
delete process.env.MAILGUN_API_KEY;
delete process.env.MAILGUN_DOMAIN;
