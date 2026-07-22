import { describe, expect, it } from "vitest";
import { generateReservationCode, tenantCodePrefix } from "./codes";

describe("tenantCodePrefix", () => {
  it("uppercases and truncates the slug", () => {
    expect(tenantCodePrefix("sankofa-house-osu")).toBe("SAN");
    expect(tenantCodePrefix("osu")).toBe("OSU");
  });

  it("falls back when the slug has no usable characters", () => {
    expect(tenantCodePrefix("---")).toBe("STA");
  });
});

describe("generateReservationCode", () => {
  it("builds PREFIX-YEAR-XXXX without ambiguous glyphs", () => {
    const code = generateReservationCode("osu-hotel", 2026, () => 0.42);
    expect(code).toMatch(/^OSU-2026-[A-HJ-KM-NP-Z2-9]{4}$/);
  });

  it("is deterministic for a fixed random source", () => {
    const a = generateReservationCode("osu-hotel", 2026, () => 0);
    expect(a).toBe("OSU-2026-AAAA");
  });
});
