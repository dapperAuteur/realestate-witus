// Ported from wanderlearn-app src/lib/tour-links.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import {
  defaultTourLinks,
  parseTourLinks,
  splitTourLinks,
  usableTourLinks,
  type TourLink,
} from "./tour-links";

const url = (label: string, featured = false) => ({
  kind: "url",
  label,
  url: `https://example.org/${label.toLowerCase()}`,
  featured,
});

describe("parseTourLinks", () => {
  it("accepts up to three links with one featured", () => {
    const result = parseTourLinks([url("Brochure", true), url("Agency"), url("Mortgage")]);
    expect(result.ok).toBe(true);
  });

  it("accepts no links (clearing them)", () => {
    expect(parseTourLinks([])).toEqual({ ok: true, data: [] });
  });

  it("rejects a fourth link", () => {
    const result = parseTourLinks([url("A"), url("B"), url("C"), url("D")]);
    expect(result).toMatchObject({ ok: false, code: "TOUR_LINKS_TOO_MANY" });
  });

  it("rejects two featured links", () => {
    const result = parseTourLinks([url("A", true), url("B", true)]);
    expect(result).toMatchObject({ ok: false, code: "TOUR_LINKS_FEATURED" });
  });

  it("rejects a blank or overlong label", () => {
    expect(parseTourLinks([{ ...url("A"), label: "   " }])).toMatchObject({ ok: false, code: "TOUR_LINK_LABEL" });
    expect(parseTourLinks([{ ...url("A"), label: "x".repeat(41) }])).toMatchObject({
      ok: false,
      code: "TOUR_LINK_LABEL",
    });
  });

  it("rejects a javascript: URL", () => {
    const result = parseTourLinks([{ ...url("A"), url: "javascript:alert(1)" }]);
    expect(result).toMatchObject({ ok: false, code: "TOUR_LINK_URL" });
  });

  it("accepts inquiry links and keeps their intent", () => {
    const result = parseTourLinks([
      { kind: "inquiry", label: " Request a tour ", intent: "tour_request", featured: true },
    ]);
    expect(result).toEqual({
      ok: true,
      data: [{ kind: "inquiry", label: "Request a tour", intent: "tour_request", featured: true }],
    });
  });

  it("rejects an inquiry link with an unknown intent", () => {
    const result = parseTourLinks([{ kind: "inquiry", label: "Call", intent: "phone", featured: false }]);
    expect(result).toMatchObject({ ok: false, code: "TOUR_LINK_INTENT" });
  });

  it("drops fields that are not part of the shape", () => {
    const result = parseTourLinks([{ ...url("A"), onclick: "alert(1)" }]);
    expect(result.ok && result.data[0]).toEqual({
      kind: "url",
      label: "A",
      url: "https://example.org/a",
      featured: false,
    });
  });

  it("rejects input that is not a list", () => {
    expect(parseTourLinks("https://example.org")).toMatchObject({ ok: false, code: "TOUR_LINKS_INVALID" });
  });
});

describe("defaultTourLinks", () => {
  it("features Request a tour and passes its own validation", () => {
    const links = defaultTourLinks({ requestTour: "Request a tour", contactAgent: "Contact agent" });
    expect(splitTourLinks(links).featured).toMatchObject({ intent: "tour_request" });
    expect(parseTourLinks(links)).toEqual({ ok: true, data: links });
  });
});

describe("usableTourLinks", () => {
  it("drops a stored URL link that is not http(s), and keeps inquiry links", () => {
    const stored = [
      { kind: "url", label: "Bad", url: "javascript:alert(1)", featured: false },
      { kind: "inquiry", label: "Ask", intent: "question", featured: false },
    ] as TourLink[];
    expect(usableTourLinks(stored)).toEqual([stored[1]]);
  });

  it("treats null as no links", () => {
    expect(usableTourLinks(null)).toEqual([]);
  });
});

describe("splitTourLinks", () => {
  it("returns the featured link and the rest in order", () => {
    const links = [url("A"), url("B", true), url("C")] as TourLink[];
    const { featured, others } = splitTourLinks(links);
    expect(featured?.label).toBe("B");
    expect(others.map((link) => link.label)).toEqual(["A", "C"]);
  });

  it("returns null when nothing is featured", () => {
    expect(splitTourLinks([url("A")] as TourLink[]).featured).toBeNull();
  });
});
