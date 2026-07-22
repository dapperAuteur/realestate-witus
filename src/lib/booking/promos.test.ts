import { describe, expect, it } from "vitest";
import { computeDiscountMinor } from "./promos";
import { unsubscribeSig, verifyUnsubscribeSig, whatsAppShareUrl } from "@/lib/campaigns";

describe("computeDiscountMinor", () => {
  it("percent discounts round to the nearest pesewa and cap at the total", () => {
    expect(computeDiscountMinor("percent", 25, 100_000)).toBe(25_000);
    expect(computeDiscountMinor("percent", 33, 10_001)).toBe(3_300);
    expect(computeDiscountMinor("percent", 90, 100)).toBe(90);
  });

  it("fixed discounts never exceed the total", () => {
    expect(computeDiscountMinor("fixed", 20_000, 100_000)).toBe(20_000);
    expect(computeDiscountMinor("fixed", 200_000, 100_000)).toBe(100_000);
  });

  it("zero and negative inputs discount nothing", () => {
    expect(computeDiscountMinor("percent", 0, 100_000)).toBe(0);
    expect(computeDiscountMinor("fixed", 500, 0)).toBe(0);
  });
});

describe("unsubscribe signatures", () => {
  it("verifies its own signature, case-insensitive on email", () => {
    const sig = unsubscribeSig("tenant-1", "Guest@Example.com");
    expect(verifyUnsubscribeSig("tenant-1", "guest@example.com", sig)).toBe(true);
  });

  it("rejects cross-tenant and tampered signatures", () => {
    const sig = unsubscribeSig("tenant-1", "guest@example.com");
    expect(verifyUnsubscribeSig("tenant-2", "guest@example.com", sig)).toBe(false);
    expect(verifyUnsubscribeSig("tenant-1", "other@example.com", sig)).toBe(false);
    expect(verifyUnsubscribeSig("tenant-1", "guest@example.com", "beef")).toBe(false);
  });
});

describe("whatsAppShareUrl", () => {
  it("encodes title, body, and link into a wa.me url", () => {
    const url = whatsAppShareUrl({
      title: "Detty December",
      body: "20% off with DETTY25",
      siteUrl: "https://demo.stay.witus.online/en",
    });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("DETTY25");
  });
});
