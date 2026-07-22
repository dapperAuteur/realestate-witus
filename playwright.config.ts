import { defineConfig, devices } from "@playwright/test";

// E2E + a11y gate (ecosystem rule; workstream 15). Chromium-only for speed —
// host-resolver-rules map the real tenant hostnames onto the local server so
// multi-tenant routing runs exactly as in production. Requires `pnpm build`
// first; run with `pnpm test:e2e`. Tests are READ-ONLY against the seeded
// demo data (no bookings clicked — the nightly reset is not a test janitor).

const PORT = 3199;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      args: [
        `--host-resolver-rules=MAP stay.witus.online 127.0.0.1, MAP demo.stay.witus.online 127.0.0.1`,
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mobile-first gate on a chromium profile (375-wide viewport).
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 667 } },
    },
  ],
});
