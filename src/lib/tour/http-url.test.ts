// Ported from wanderlearn-app src/lib/http-url.test.ts @ c7f5616, 2026-10-14 (plans/08).
import { describe, expect, it } from "vitest";
import { isHttpUrl, parseHttpUrl } from "./http-url";

describe("parseHttpUrl / isHttpUrl", () => {
  const good = ["https://example.org/listing", "http://example.org", "https://ex.org/a?b=c#d"];
  const bad = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "ftp://example.org",
    "mailto:a@example.org",
    "not a url",
  ];

  it.each(good)("accepts %s", (url) => {
    expect(parseHttpUrl(url)).toBe(url);
    expect(isHttpUrl(url)).toBe(true);
  });

  it.each(bad)("rejects %s", (url) => {
    expect(parseHttpUrl(url)).toBeNull();
    expect(isHttpUrl(url)).toBe(false);
  });

  it("trims what an agent pasted", () => {
    expect(parseHttpUrl("  https://example.org/a  ")).toBe("https://example.org/a");
  });

  it("caps the length at 500", () => {
    expect(parseHttpUrl(`https://example.org/${"a".repeat(500)}`)).toBeNull();
  });

  it("rejects anything that is not a string", () => {
    expect(parseHttpUrl(undefined)).toBeNull();
    expect(parseHttpUrl(42)).toBeNull();
    expect(parseHttpUrl({ href: "https://example.org" })).toBeNull();
  });
});
