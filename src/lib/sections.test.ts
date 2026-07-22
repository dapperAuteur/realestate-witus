import { describe, expect, it } from "vitest";
import type { TenantFlags } from "@/db/schema/tenancy";
import {
  DEFAULT_SECTION_ORDER,
  normalizeSectionVariant,
  resolveSectionConfig,
} from "./sections";

const ALL_FLAGS: TenantFlags = {
  dining: true,
  events: true,
  concierge: true,
  virtualTour: true,
};

describe("resolveSectionConfig", () => {
  it("defaults to the full order for an empty theme with all flags on", () => {
    const config = resolveSectionConfig({}, ALL_FLAGS);
    expect(config.order).toEqual([...DEFAULT_SECTION_ORDER]);
  });

  it("respects the owner's order and appends missing sections", () => {
    const config = resolveSectionConfig(
      { sectionOrder: ["rooms", "hero", "contact"] },
      ALL_FLAGS,
    );
    expect(config.order.slice(0, 3)).toEqual(["rooms", "hero", "contact"]);
    // Everything else still renders, in default relative order.
    expect(config.order).toContain("dining");
    expect(config.order).toContain("guide");
    expect(config.order).toHaveLength(DEFAULT_SECTION_ORDER.length);
  });

  it("drops unknown keys and duplicates instead of erroring", () => {
    const config = resolveSectionConfig(
      { sectionOrder: ["rooms", "rooms", "casino", "hero"] },
      ALL_FLAGS,
    );
    expect(config.order.filter((k) => k === "rooms")).toHaveLength(1);
    expect(config.order).not.toContain("casino");
  });

  it("hides sections but never the hero", () => {
    const config = resolveSectionConfig(
      { sectionHidden: ["events", "hero", "guide"] },
      ALL_FLAGS,
    );
    expect(config.order).toContain("hero");
    expect(config.order).not.toContain("events");
    expect(config.order).not.toContain("guide");
  });

  it("flag-gated sections vanish when BAM has not enabled the flag", () => {
    const config = resolveSectionConfig({}, { events: true });
    expect(config.order).toContain("events");
    expect(config.order).not.toContain("dining");
    expect(config.order).not.toContain("concierge");
    expect(config.order).not.toContain("tour");
    // Un-gated sections are unaffected.
    expect(config.order).toContain("rooms");
    expect(config.order).toContain("guide");
  });

  it("normalizes variants and collapses unknown ones to the default", () => {
    const config = resolveSectionConfig(
      { sectionVariants: { rooms: "list", hero: "marquee" } },
      ALL_FLAGS,
    );
    expect(config.variants.rooms).toBe("list");
    expect(config.variants.hero).toBe("image");
    expect(config.variants.contact).toBe("default");
  });
});

describe("normalizeSectionVariant", () => {
  it("accepts known variants, falls back to the first otherwise", () => {
    expect(normalizeSectionVariant("rooms", "grid")).toBe("grid");
    expect(normalizeSectionVariant("rooms", "carousel")).toBe("grid");
    expect(normalizeSectionVariant("hero", undefined)).toBe("image");
  });
});
