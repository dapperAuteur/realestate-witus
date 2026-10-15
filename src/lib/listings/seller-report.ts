// The seller report (plans/08 6.5: "Show your seller how many buyers walked
// the tour"). Pure: the admin page queries, this adds up. Days are the UTC
// dates the view counter records (api/listings/[slug]/views), and a day with
// no row is a real zero, so every day in the range is listed.

export const REPORT_RANGES = [7, 30, 90] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export function parseReportRange(raw: string | undefined): ReportRange {
  const n = Number(raw);
  return (REPORT_RANGES as readonly number[]).includes(n) ? (n as ReportRange) : 30;
}

/** The `days` dates ending today, oldest first, as YYYY-MM-DD (UTC). */
export function reportDays(days: number, today: Date): string[] {
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export interface ViewRow {
  day: string;
  surface: string;
  pageViews: number;
  tourOpens: number;
}

export interface InquiryRow {
  /** YYYY-MM-DD, UTC. */
  day: string;
  kind: "tour_request" | "question";
}

export interface ReportDay {
  day: string;
  views: number;
  opens: number;
  inquiries: number;
}

export interface SellerReport {
  days: ReportDay[];
  totals: {
    views: number;
    opens: number;
    /** On the listing page itself, and through the agent's embed on their own site. */
    page: { views: number; opens: number };
    embed: { views: number; opens: number };
    inquiries: number;
    tourRequests: number;
  };
  /** Tour opens per view, 0 to 1; null with no views (no rate is better than a made-up one). */
  openRate: number | null;
  /** The day with the most views, or null when nobody came. */
  busiest: ReportDay | null;
}

export function sellerReport(days: readonly string[], views: readonly ViewRow[], inquiries: readonly InquiryRow[]): SellerReport {
  const inRange = new Set(days);
  const byDay = new Map(days.map((day) => [day, { day, views: 0, opens: 0, inquiries: 0 }]));
  const page = { views: 0, opens: 0 };
  const embed = { views: 0, opens: 0 };
  for (const row of views) {
    if (!inRange.has(row.day)) continue;
    const day = byDay.get(row.day)!;
    day.views += row.pageViews;
    day.opens += row.tourOpens;
    const side = row.surface === "embed" ? embed : page;
    side.views += row.pageViews;
    side.opens += row.tourOpens;
  }
  let tourRequests = 0;
  let inquiryCount = 0;
  for (const row of inquiries) {
    if (!inRange.has(row.day)) continue;
    byDay.get(row.day)!.inquiries += 1;
    inquiryCount += 1;
    if (row.kind === "tour_request") tourRequests += 1;
  }
  const list = [...byDay.values()];
  const totalViews = page.views + embed.views;
  const totalOpens = page.opens + embed.opens;
  const busiest = list.reduce<ReportDay | null>((best, day) => (day.views > (best?.views ?? 0) ? day : best), null);
  return {
    days: list,
    totals: { views: totalViews, opens: totalOpens, page, embed, inquiries: inquiryCount, tourRequests },
    openRate: totalViews > 0 ? Math.min(1, totalOpens / totalViews) : null,
    busiest,
  };
}

/** One room's totals over the report's days (listing_room_views, summed). */
export interface RoomRow {
  sceneId: string;
  name: string;
  visits: number;
  seconds: number;
  exits: number;
}

export interface RoomReport {
  /** Most time on screen first. */
  rooms: (RoomRow & { averageSeconds: number | null })[];
  /** Where buyers were when they left the tour, most first; at most three. */
  leftFrom: { name: string; exits: number; share: number }[];
}

/** The rooms part of the report, or null when no room was visited in the period. */
export function roomReport(rows: readonly RoomRow[]): RoomReport | null {
  const visited = rows.filter((row) => row.visits > 0 || row.seconds > 0);
  if (visited.length === 0) return null;
  const totalExits = visited.reduce((sum, row) => sum + row.exits, 0);
  return {
    rooms: [...visited]
      .sort((a, b) => b.seconds - a.seconds || b.visits - a.visits || a.name.localeCompare(b.name))
      .map((row) => ({ ...row, averageSeconds: row.visits > 0 ? Math.round(row.seconds / row.visits) : null })),
    leftFrom: totalExits
      ? visited
          .filter((row) => row.exits > 0)
          .sort((a, b) => b.exits - a.exits || a.name.localeCompare(b.name))
          .slice(0, 3)
          .map((row) => ({ name: row.name, exits: row.exits, share: row.exits / totalExits }))
      : [],
  };
}
