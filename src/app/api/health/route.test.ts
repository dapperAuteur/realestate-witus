import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The uptime endpoint's whole value is that it fails when the database fails,
// and that it never repeats a driver error (which carries the connection
// string, credentials and all) into a response body or a log line.

const execute = vi.fn();

vi.mock("@/db", () => ({
  db: () => ({ execute }),
}));

const SECRET_URL = "postgres://user:hunter2@db.example.neon.tech/main";

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  execute.mockReset();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorLog.mockRestore();
});

async function route() {
  return import("./route");
}

describe("GET /api/health", () => {
  it("returns 200 with the db check when the query succeeds", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await route();

    const response = await GET();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, checks: { db: "ok" } });
  });

  it("returns 503 and never echoes the driver error", async () => {
    execute.mockRejectedValue(new Error(`connect ECONNREFUSED ${SECRET_URL}`));
    const { GET } = await route();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, error: "database_unreachable" });

    // Neither the body nor the log may carry the connection string.
    expect(JSON.stringify(body)).not.toContain("hunter2");
    for (const call of errorLog.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("hunter2");
      expect(JSON.stringify(call)).not.toContain("ECONNREFUSED");
    }
  });

  it("marks every response no-store so a monitor never grades a cache hit", async () => {
    execute.mockResolvedValue([]);
    const { GET, HEAD } = await route();

    for (const response of [await GET(), await HEAD()]) {
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("fails closed when the query outlives the timeout", async () => {
    vi.useFakeTimers();
    try {
      execute.mockReturnValue(new Promise(() => {}));
      const { GET } = await route();

      const pending = GET();
      await vi.advanceTimersByTimeAsync(4_000);
      const response = await pending;

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, error: "database_unreachable" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("HEAD /api/health", () => {
  it("answers with the status code alone", async () => {
    execute.mockResolvedValue([]);
    const { HEAD } = await route();

    const okResponse = await HEAD();
    expect(okResponse.status).toBe(200);
    expect(await okResponse.text()).toBe("");

    execute.mockRejectedValue(new Error(SECRET_URL));
    const downResponse = await HEAD();
    expect(downResponse.status).toBe(503);
    expect(await downResponse.text()).toBe("");
  });
});
