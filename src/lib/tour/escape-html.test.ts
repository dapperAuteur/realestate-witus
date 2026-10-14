import { describe, expect, it } from "vitest";
import { escapeHtml, escapeHtmlMultiline } from "./escape-html";

describe("escapeHtml", () => {
  it("neutralizes markup an agent could type into a room name", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("escapes ampersands first, so entities are not double-decoded", () => {
    expect(escapeHtml("Bed & Bath &lt;")).toBe("Bed &amp; Bath &amp;lt;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("Owner's suite")).toBe("Owner&#39;s suite");
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("Kitchen")).toBe("Kitchen");
  });
});

describe("escapeHtmlMultiline", () => {
  it("keeps line breaks as <br> after escaping", () => {
    expect(escapeHtmlMultiline("Gas range\n<b>new</b>")).toBe("Gas range<br>&lt;b&gt;new&lt;/b&gt;");
  });

  it("handles Windows line endings", () => {
    expect(escapeHtmlMultiline("a\r\nb")).toBe("a<br>b");
  });
});
