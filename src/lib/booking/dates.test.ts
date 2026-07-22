import { describe, expect, it } from "vitest";
import {
  addDays,
  dowBit,
  dowMaskIncludes,
  eachNight,
  isIsoDate,
  MAX_STAY_NIGHTS,
  nightsBetween,
  validateStay,
} from "./dates";

describe("isIsoDate", () => {
  it("accepts real dates and rejects shape-alikes", () => {
    expect(isIsoDate("2026-12-01")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-12-1")).toBe(false);
    expect(isIsoDate("garbage")).toBe(false);
  });
});

describe("addDays / nightsBetween", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(nightsBetween("2026-12-28", "2027-01-02")).toBe(5);
  });
});

describe("eachNight", () => {
  it("is half-open: the checkout night is not charged", () => {
    expect(eachNight("2026-12-01", "2026-12-04")).toEqual([
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
    ]);
  });

  it("returns empty for zero or negative stays", () => {
    expect(eachNight("2026-12-01", "2026-12-01")).toEqual([]);
    expect(eachNight("2026-12-02", "2026-12-01")).toEqual([]);
  });
});

describe("dowBit / dowMaskIncludes (Mon=1<<0 .. Sun=1<<6)", () => {
  it("maps known weekdays to the schema's bit convention", () => {
    expect(dowBit("2026-07-13")).toBe(1 << 0); // Monday
    expect(dowBit("2026-12-25")).toBe(1 << 4); // Friday
    expect(dowBit("2026-12-26")).toBe(1 << 5); // Saturday
    expect(dowBit("2026-12-27")).toBe(1 << 6); // Sunday
  });

  it("null mask means every day; a Fri+Sat mask excludes a Thursday", () => {
    const weekend = (1 << 4) | (1 << 5);
    expect(dowMaskIncludes(null, "2026-12-24")).toBe(true);
    expect(dowMaskIncludes(weekend, "2026-12-25")).toBe(true);
    expect(dowMaskIncludes(weekend, "2026-12-24")).toBe(false); // Thursday
  });
});

describe("validateStay", () => {
  it("accepts a normal stay", () => {
    const result = validateStay("2026-12-01", "2026-12-05");
    expect(result).toEqual({ ok: true, data: { nights: 4 } });
  });

  it("rejects malformed dates, inverted ranges, and marathon stays", () => {
    expect(validateStay("2026-12-1", "2026-12-05")).toMatchObject({
      ok: false,
      code: "INVALID_DATE",
    });
    expect(validateStay("2026-12-05", "2026-12-05")).toMatchObject({
      ok: false,
      code: "INVALID_RANGE",
    });
    expect(
      validateStay("2026-01-01", addDays("2026-01-01", MAX_STAY_NIGHTS + 1)),
    ).toMatchObject({ ok: false, code: "STAY_TOO_LONG" });
  });

  it("honours a custom max for admin surfaces", () => {
    expect(validateStay("2026-01-01", "2026-04-01", { maxNights: 120 }).ok).toBe(
      true,
    );
  });
});
