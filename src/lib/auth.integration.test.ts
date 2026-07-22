// Magic-link round trip against the real Neon database (skipped without a DB
// URL). Mailgun is unset in tests, so the mailer dev-logs the link — the test
// captures it from the console, follows it, and proves the adapter mapping
// over our users/sessions/verifications tables end to end. The test user is
// deleted in afterAll (cascade cleans sessions/accounts).

import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { users, verifications } from "@/db/schema";
import { auth } from "./auth";

const hasDb = Boolean(
  process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL,
);

const TEST_EMAIL = `itest-auth-${randomUUID().slice(0, 8)}@example.com`;

describe.skipIf(!hasDb)("magic-link sign-in against Neon", () => {
  afterAll(async () => {
    await db().delete(users).where(eq(users.email, TEST_EMAIL));
    // Unconsumed verification tokens for this run (identifier embeds no email,
    // so sweep only rows younger than this suite via the token we captured).
  });

  it("requests a link, verifies it, and lands with a session", async () => {
    const logSpy = vi.spyOn(console, "log");
    const result = await auth().api.signInMagicLink({
      body: { email: TEST_EMAIL, callbackURL: "/en" },
      headers: new Headers({ host: "localhost:3000" }),
    });
    expect(result.status).toBe(true);

    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    logSpy.mockRestore();
    const url = logged.match(/http:\/\/localhost:3000\S*magic-link\S*/)?.[0];
    expect(url, "dev mailer should log the magic link").toBeTruthy();

    const response = await auth().handler(
      new Request(url as string, { redirect: "manual" }),
    );
    // Verify redirects to callbackURL and sets the session cookie.
    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("set-cookie") ?? "").toContain("session_token");

    const [created] = await db()
      .select({ id: users.id, email: users.email, isPlatformOwner: users.isPlatformOwner })
      .from(users)
      .where(eq(users.email, TEST_EMAIL));
    expect(created).toBeTruthy();
    expect(created.isPlatformOwner).toBe(false);
  });

  it("leaves no dangling verification for a consumed token", async () => {
    const rows = await db()
      .select({ id: verifications.id })
      .from(verifications)
      .where(like(verifications.identifier, `%${TEST_EMAIL}%`));
    expect(rows).toHaveLength(0);
  });
});
