import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two sign-out actions, RUN (BAM, 2026-10-29, witus task 128 option (b)):
 *   - "Sign out" ends this app's session and goes home. It never navigates to the IdP,
 *     even when the end-session URL is configured and the host is the branded one.
 *   - "Sign out of WitUS everywhere" ends this app's session FIRST, then navigates to the
 *     IdP's endsession endpoint, and only on the WitUS-branded host. On an agency tenant
 *     host it stays local even when posted to directly (a server action is a public POST).
 */

const ENDSESSION = "https://accounts.witus.online/api/idp/oauth2/endsession?client_id=realestate-client";
const events: string[] = [];
const state = { ecosystem: true, endSession: ENDSESSION as string | null, localFails: false };

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    events.push(`redirect:${url}`);
    // Like Next's redirect(): nothing after it runs.
    throw new RedirectSignal(url);
  },
}));
vi.mock("@/lib/auth", () => ({
  hasAuth: () => true,
  auth: () => ({
    api: {
      signOut: async () => {
        events.push("local-sign-out");
        if (state.localFails) throw new Error("auth store down");
      },
    },
  }),
}));
vi.mock("@/lib/env", () => ({
  env: { BETTER_AUTH_URL: "https://realestate.witus.online" },
  get witusEndSessionEndpoint() {
    return state.endSession;
  },
}));
vi.mock("@/lib/witus-sso", () => ({
  witusEcosystemEnabled: async () => state.ecosystem,
}));

const { signOutAction, signOutEverywhereAction } = await import("./sign-out-action");

function form(lang = "en"): FormData {
  const f = new FormData();
  f.set("lang", lang);
  return f;
}

async function run(action: (f: FormData) => Promise<void>, f = form()): Promise<string> {
  try {
    await action(f);
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
  throw new Error("action returned without redirecting");
}

beforeEach(() => {
  events.length = 0;
  state.ecosystem = true;
  state.endSession = ENDSESSION;
  state.localFails = false;
});

describe('"Sign out" (signOutAction)', () => {
  it("never navigates to endsession, even when it is configured on the branded host", async () => {
    const to = await run(signOutAction);
    expect(to).toBe("/en");
    expect(events).toEqual(["local-sign-out", "redirect:/en"]);
    expect(events.join(" ")).not.toContain("endsession");
  });

  it("returns to the local home in the visitor's language", async () => {
    expect(await run(signOutAction, form("es"))).toBe("/es");
  });

  it("still goes home when the local sign-out fails", async () => {
    state.localFails = true;
    expect(await run(signOutAction)).toBe("/en");
  });
});

describe('"Sign out of WitUS everywhere" (signOutEverywhereAction)', () => {
  it("ends the local session BEFORE navigating to the IdP", async () => {
    await run(signOutEverywhereAction);
    expect(events[0]).toBe("local-sign-out");
    expect(events[1]).toMatch(/^redirect:https:\/\/accounts\.witus\.online\//);
  });

  it("navigates to endsession with client_id and post_logout_redirect_uri = origin + '/'", async () => {
    const to = await run(signOutEverywhereAction);
    expect(to).toBe(
      `${ENDSESSION}&post_logout_redirect_uri=${encodeURIComponent("https://realestate.witus.online/")}`,
    );
    const url = new URL(to);
    expect(url.pathname).toBe("/api/idp/oauth2/endsession");
    expect(url.searchParams.get("client_id")).toBe("realestate-client");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://realestate.witus.online/");
  });

  it("stays local on an agency tenant host, even when posted to directly", async () => {
    state.ecosystem = false;
    const to = await run(signOutEverywhereAction);
    expect(to).toBe("/en");
    expect(events).toEqual(["local-sign-out", "redirect:/en"]);
  });

  it("still hands off to the IdP when the local sign-out errors (error swallowed, awaited first)", async () => {
    state.localFails = true;
    const to = await run(signOutEverywhereAction);
    expect(events[0]).toBe("local-sign-out");
    expect(to).toContain("/oauth2/endsession?client_id=realestate-client");
  });

  it("stays local when this app is not a configured ecosystem client", async () => {
    state.endSession = null;
    expect(await run(signOutEverywhereAction)).toBe("/en");
  });
});
