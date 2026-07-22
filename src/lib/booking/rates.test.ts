import { describe, expect, it } from "vitest";
import {
  computeDepositMinor,
  resolveNightRate,
  resolveStayRates,
  type RateOverrideInput,
} from "./rates";

const BASE = 50_000; // GHS 500.00 in pesewas

function override(partial: Partial<RateOverrideInput>): RateOverrideInput {
  return {
    id: "o-default",
    label: "Override",
    startDate: "2026-12-01",
    endDate: "2026-12-31",
    dowMask: null,
    rateMinor: 75_000,
    priority: 0,
    ...partial,
  };
}

describe("resolveNightRate", () => {
  it("falls back to the base rate with no overrides", () => {
    expect(resolveNightRate("2026-12-05", BASE, [])).toEqual({
      date: "2026-12-05",
      rateMinor: BASE,
    });
  });

  it("applies an override only inside its inclusive date range", () => {
    const detty = override({ id: "detty", label: "Detty December" });
    expect(resolveNightRate("2026-11-30", BASE, [detty]).rateMinor).toBe(BASE);
    expect(resolveNightRate("2026-12-01", BASE, [detty]).rateMinor).toBe(75_000);
    expect(resolveNightRate("2026-12-31", BASE, [detty]).rateMinor).toBe(75_000);
    expect(resolveNightRate("2027-01-01", BASE, [detty]).rateMinor).toBe(BASE);
  });

  it("respects dow_mask: a Fri+Sat weekend rate skips a Thursday night", () => {
    const weekend = override({
      id: "wknd",
      label: "Weekend",
      dowMask: (1 << 4) | (1 << 5),
      rateMinor: 60_000,
    });
    // 2026-12-24 is a Thursday, 25th a Friday, 26th a Saturday.
    expect(resolveNightRate("2026-12-24", BASE, [weekend]).rateMinor).toBe(BASE);
    expect(resolveNightRate("2026-12-25", BASE, [weekend]).rateMinor).toBe(60_000);
    expect(resolveNightRate("2026-12-26", BASE, [weekend]).rateMinor).toBe(60_000);
  });

  it("the highest priority wins when overrides overlap", () => {
    const season = override({ id: "season", label: "Season", priority: 10 });
    const event = override({
      id: "event",
      label: "Afrochella",
      priority: 20,
      rateMinor: 120_000,
    });
    const night = resolveNightRate("2026-12-28", BASE, [season, event]);
    expect(night).toEqual({
      date: "2026-12-28",
      rateMinor: 120_000,
      overrideLabel: "Afrochella",
    });
  });

  it("priority ties go to the most recently created override", () => {
    const older = override({
      id: "a-older",
      label: "Older",
      priority: 5,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const newer = override({
      id: "z-newer",
      label: "Newer",
      priority: 5,
      rateMinor: 80_000,
      createdAt: "2026-06-01T00:00:00Z",
    });
    expect(
      resolveNightRate("2026-12-10", BASE, [newer, older]).overrideLabel,
    ).toBe("Newer");
    expect(
      resolveNightRate("2026-12-10", BASE, [older, newer]).overrideLabel,
    ).toBe("Newer");
  });
});

describe("resolveStayRates", () => {
  it("prices each night independently and totals them", () => {
    const detty = override({
      id: "detty",
      label: "Detty December",
      priority: 10,
    });
    const weekend = override({
      id: "wknd",
      label: "Weekend",
      priority: 20,
      dowMask: (1 << 4) | (1 << 5),
      rateMinor: 90_000,
    });
    // Nights: Thu 24 (Detty), Fri 25 (Weekend), Sat 26 (Weekend).
    const stay = resolveStayRates("2026-12-24", "2026-12-27", BASE, [
      detty,
      weekend,
    ]);
    expect(stay.nights).toEqual([
      { date: "2026-12-24", rateMinor: 75_000, overrideLabel: "Detty December" },
      { date: "2026-12-25", rateMinor: 90_000, overrideLabel: "Weekend" },
      { date: "2026-12-26", rateMinor: 90_000, overrideLabel: "Weekend" },
    ]);
    expect(stay.totalMinor).toBe(255_000);
  });

  it("matches reservations.rate_breakdown shape for the base-rate case", () => {
    const stay = resolveStayRates("2026-03-01", "2026-03-03", BASE, []);
    expect(stay.nights).toEqual([
      { date: "2026-03-01", rateMinor: BASE },
      { date: "2026-03-02", rateMinor: BASE },
    ]);
    expect(stay.totalMinor).toBe(100_000);
  });
});

describe("computeDepositMinor", () => {
  it("takes 30% by default policy and rounds to the nearest pesewa", () => {
    expect(computeDepositMinor(100_000, 30)).toBe(30_000);
    expect(computeDepositMinor(74_500, 30)).toBe(22_350);
    expect(computeDepositMinor(101, 50)).toBe(51); // .5 rounds up
    expect(computeDepositMinor(0, 30)).toBe(0);
  });
});
