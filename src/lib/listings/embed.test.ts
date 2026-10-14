import { describe, expect, it } from "vitest";
import { embedSnippet, listingEmbedUrl, listingPageUrl } from "./embed";

describe("listing URLs", () => {
  it("builds the page and embed URLs on the given origin", () => {
    expect(listingPageUrl("https://homes.example.com", "osu-heights-k3x9ab")).toBe(
      "https://homes.example.com/en/listings/osu-heights-k3x9ab",
    );
    expect(listingEmbedUrl("https://homes.example.com", "osu-heights-k3x9ab")).toBe(
      "https://homes.example.com/embed/listings/osu-heights-k3x9ab",
    );
  });
});

describe("embedSnippet", () => {
  const snippet = embedSnippet({
    embedUrl: "https://homes.example.com/embed/listings/osu-heights-k3x9ab",
    title: "360 tour: Osu Heights",
  });

  it("is one line with a responsive box and a titled iframe", () => {
    expect(snippet).not.toContain("\n");
    expect(snippet).toContain('aspect-ratio:16/10');
    expect(snippet).toContain('title="360 tour: Osu Heights"');
    expect(snippet).toContain('src="https://homes.example.com/embed/listings/osu-heights-k3x9ab"');
    expect(snippet).toContain("allowfullscreen");
    expect(snippet).toContain('loading="lazy"');
  });

  it("escapes a title that would break out of the attribute", () => {
    const hostile = embedSnippet({ embedUrl: "https://x.test/embed/listings/a", title: `"><script>alert(1)</script>` });
    expect(hostile).not.toContain("<script>");
    expect(hostile).toContain("&quot;&gt;&lt;script&gt;");
  });
});
