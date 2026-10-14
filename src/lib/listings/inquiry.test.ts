import { describe, expect, it } from "vitest";
import { inquiryEmail, MIN_FILL_MS, parseInquiry } from "./inquiry";

const NOW = 1_800_000_000_000;
const valid = {
  kind: "tour_request",
  source: "action_panel",
  surface: "page",
  name: "  Ama Mensah ",
  email: "Ama@Example.com",
  phone: "+233 20 000 0000",
  message: "Is the garden shared?",
  preferredTimes: "Weekday evenings",
  website: "",
  startedAt: NOW - 30_000,
};

describe("parseInquiry", () => {
  it("accepts a real submission and tidies it", () => {
    expect(parseInquiry(valid, NOW)).toEqual({
      ok: true,
      data: {
        kind: "tour_request",
        source: "action_panel",
        surface: "page",
        name: "Ama Mensah",
        email: "ama@example.com",
        phone: "+233 20 000 0000",
        message: "Is the garden shared?",
        preferredTimes: "Weekday evenings",
      },
    });
  });

  it("drops preferred times from a question", () => {
    const result = parseInquiry({ ...valid, kind: "question" }, NOW);
    expect(result.ok && result.data.preferredTimes).toBeNull();
  });

  it("treats a filled honeypot as spam", () => {
    expect(parseInquiry({ ...valid, website: "http://spam.test" }, NOW)).toMatchObject({ ok: false, code: "SPAM" });
  });

  it("treats a submit faster than a person as spam", () => {
    expect(parseInquiry({ ...valid, startedAt: NOW - (MIN_FILL_MS - 1) }, NOW)).toMatchObject({
      ok: false,
      code: "SPAM",
    });
  });

  it("allows a missing start time (a form rendered without script)", () => {
    expect(parseInquiry({ ...valid, startedAt: undefined }, NOW).ok).toBe(true);
  });

  it("needs a name and a reply address", () => {
    expect(parseInquiry({ ...valid, name: "   " }, NOW)).toMatchObject({ ok: false, code: "INQUIRY_NAME" });
    expect(parseInquiry({ ...valid, email: "not-an-email" }, NOW)).toMatchObject({ ok: false, code: "INQUIRY_EMAIL" });
  });

  it("rejects an unknown kind, and fields that are not text", () => {
    expect(parseInquiry({ ...valid, kind: "offer" }, NOW)).toMatchObject({ ok: false, code: "INQUIRY_KIND" });
    expect(parseInquiry({ ...valid, phone: 12345 }, NOW)).toMatchObject({ ok: false, code: "INQUIRY_PHONE" });
  });

  it("caps the message", () => {
    expect(parseInquiry({ ...valid, message: "x".repeat(2001) }, NOW)).toMatchObject({
      ok: false,
      code: "INQUIRY_MESSAGE",
    });
  });

  it("defaults an unknown source to the form and an unknown surface to the page", () => {
    const result = parseInquiry({ ...valid, source: "popup", surface: "elsewhere" }, NOW);
    expect(result.ok && [result.data.source, result.data.surface]).toEqual(["form", "page"]);
  });
});

describe("inquiryEmail", () => {
  it("tells the agent who, what, when, and where it came from", () => {
    const parsed = parseInquiry({ ...valid, surface: "embed" }, NOW);
    if (!parsed.ok) throw new Error("fixture should parse");
    const email = inquiryEmail({
      inquiry: parsed.data,
      listingTitle: "Osu Heights",
      listingUrl: "https://homes.example.com/en/listings/osu-heights-k3x9ab",
    });
    expect(email.subject).toBe("Tour request: Osu Heights");
    expect(email.text).toContain("From: Ama Mensah <ama@example.com>");
    expect(email.text).toContain("Good times to visit: Weekday evenings");
    expect(email.text).toContain("tour on your own site");
    expect(email.text).not.toContain("—");
  });
});
