import { describe, expect, it } from "vitest";
import { parseReportRange, reportDays, roomReport, sellerReport } from "./seller-report";

describe("reportDays", () => {
  it("lists every UTC date in the range, oldest first, ending today", () => {
    expect(reportDays(3, new Date("2026-10-14T23:30:00-04:00"))).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(reportDays(7, new Date("2026-03-02T12:00:00Z"))[0]).toBe("2026-02-24");
  });
});

describe("parseReportRange", () => {
  it("takes 7, 30 or 90 days, and 30 otherwise", () => {
    expect(parseReportRange("7")).toBe(7);
    expect(parseReportRange("90")).toBe(90);
    expect(parseReportRange("365")).toBe(30);
    expect(parseReportRange(undefined)).toBe(30);
  });
});

describe("sellerReport", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14"];

  it("adds up both surfaces, fills quiet days with zero, and finds the busiest day", () => {
    const report = sellerReport(
      days,
      [
        { day: "2026-10-12", surface: "page", pageViews: 10, tourOpens: 4 },
        { day: "2026-10-12", surface: "embed", pageViews: 6, tourOpens: 3 },
        { day: "2026-10-14", surface: "page", pageViews: 2, tourOpens: 2 },
        { day: "2026-09-01", surface: "page", pageViews: 99, tourOpens: 99 },
      ],
      [
        { day: "2026-10-12", kind: "tour_request" },
        { day: "2026-10-14", kind: "question" },
        { day: "2026-09-01", kind: "tour_request" },
      ],
    );
    expect(report.days).toEqual([
      { day: "2026-10-12", views: 16, opens: 7, inquiries: 1 },
      { day: "2026-10-13", views: 0, opens: 0, inquiries: 0 },
      { day: "2026-10-14", views: 2, opens: 2, inquiries: 1 },
    ]);
    expect(report.totals).toEqual({
      views: 18,
      opens: 9,
      page: { views: 12, opens: 6 },
      embed: { views: 6, opens: 3 },
      inquiries: 2,
      tourRequests: 1,
    });
    expect(report.openRate).toBe(0.5);
    expect(report.busiest?.day).toBe("2026-10-12");
  });

  it("gives no rate and no busiest day when nobody came", () => {
    const report = sellerReport(days, [], []);
    expect([report.openRate, report.busiest, report.totals.views]).toEqual([null, null, 0]);
  });

  it("never claims more than one open per view", () => {
    // A tour opened from a page view counted the day before, at midnight.
    expect(sellerReport(days, [{ day: "2026-10-13", surface: "page", pageViews: 1, tourOpens: 3 }], []).openRate).toBe(1);
  });
});

describe("roomReport", () => {
  const row = (name: string, visits: number, seconds: number, exits: number) => ({ sceneId: name, name, visits, seconds, exits });

  it("ranks rooms by time on screen, averages per visit, and finds where buyers left", () => {
    const report = roomReport([row("Hall", 10, 300, 2), row("Kitchen", 6, 600, 5), row("Den", 0, 0, 0), row("Bath", 3, 30, 3)]);
    expect(report?.rooms.map((r) => [r.name, r.averageSeconds])).toEqual([
      ["Kitchen", 100],
      ["Hall", 30],
      ["Bath", 10],
    ]);
    expect(report?.leftFrom).toEqual([
      { name: "Kitchen", exits: 5, share: 0.5 },
      { name: "Bath", exits: 3, share: 0.3 },
      { name: "Hall", exits: 2, share: 0.2 },
    ]);
  });

  it("says nothing when no room was visited", () => {
    expect(roomReport([])).toBeNull();
    expect(roomReport([row("Den", 0, 0, 0)])).toBeNull();
  });
});
