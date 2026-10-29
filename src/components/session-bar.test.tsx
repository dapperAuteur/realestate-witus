import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/dictionaries/en.json";

/**
 * The session bar's sign-out controls (BAM, 2026-10-29, witus task 128 option (b)):
 * "Sign out" is always there and always named exactly that; "Sign out of WitUS
 * everywhere" appears only where the everywhere URL resolves (the branded host of a
 * configured client), with its help text wired through aria-describedby.
 */

const state = { everywhereUrl: null as string | null };

vi.mock("@/app/[lang]/sign-out-action", () => ({
  signOutAction: async () => {},
  signOutEverywhereAction: async () => {},
}));
vi.mock("@/lib/rbac", () => ({
  getSessionUser: async () => ({ id: "u1", email: "ada@example.test", isPlatformOwner: false }),
  getMembership: async () => null,
  roleSatisfies: () => false,
}));
vi.mock("@/lib/tenant", () => ({ resolveTenant: async () => null }));
vi.mock("@/lib/sign-out", () => ({
  witusEverywhereSignOutUrl: async () => state.everywhereUrl,
}));

const { SessionBar } = await import("./session-bar");

// No DOM test environment in this repo (vitest runs in node), so render to HTML and
// read the markup directly.
async function render(): Promise<string> {
  const el = await SessionBar({ lang: "en", dict: en });
  return renderToStaticMarkup(el);
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
}

beforeEach(() => {
  state.everywhereUrl = null;
});

describe("SessionBar sign-out controls", () => {
  it('shows only "Sign out" when no end-session URL resolves (tenant host or unconfigured)', async () => {
    const html = await render();
    expect(buttons(html)).toEqual(["Sign out"]);
    expect(html).not.toContain("WitUS");
    expect(html).not.toContain("aria-describedby");
  });

  it('adds "Sign out of WitUS everywhere" beside "Sign out" when configured', async () => {
    state.everywhereUrl =
      "https://accounts.witus.online/api/idp/oauth2/endsession?client_id=c&post_logout_redirect_uri=x";
    const html = await render();
    expect(buttons(html)).toEqual(["Sign out", "Sign out of WitUS everywhere"]);
  });

  it("links the help text to the everywhere control with aria-describedby", async () => {
    state.everywhereUrl = "https://accounts.witus.online/api/idp/oauth2/endsession?client_id=c";
    const html = await render();
    const describedBy = html.match(
      /<button\b[^>]*aria-describedby="([^"]+)"[^>]*>Sign out of WitUS everywhere<\/button>/,
    )?.[1];
    expect(describedBy).toBeTruthy();
    const help = html.match(new RegExp(`<p\\b[^>]*id="${describedBy}"[^>]*>([^<]*)</p>`))?.[1];
    expect(help).toBe(
      "Also signs you out of WitUS. Other WitUS apps you are signed in to stay signed in until you sign out of them.",
    );
  });
});
