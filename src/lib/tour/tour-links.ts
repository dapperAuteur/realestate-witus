// Ported from wanderlearn-app src/lib/tour-links.ts @ c7f5616, 2026-10-14 (plans/08).
// Extended with `kind: "inquiry"` (plans/08 section 4) so a pinned action can
// open the listing's inquiry form, not only an external URL. The zod schema
// became parseTourLinks: this repo validates by hand.

import { err, ok, type Result } from "@/lib/result";
import { isHttpUrl, parseHttpUrl } from "./http-url";

/** Which form an inquiry link opens. Matches the `inquiry_kind` enum. */
export type InquiryIntent = "tour_request" | "question";

/**
 * Links pinned in the viewer on every scene, so they stay put through
 * fullscreen and the embed. Stored as one jsonb array on `listings.tour_links`.
 */
export type TourLink =
  | { kind: "url"; label: string; url: string; featured: boolean }
  | { kind: "inquiry"; label: string; intent: InquiryIntent; featured: boolean };

export const MAX_TOUR_LINKS = 3;
export const TOUR_LINK_LABEL_MAX = 40;

/**
 * What a new listing starts with: "Request a tour" featured, "Contact agent"
 * behind More. Labels come from the dictionary at creation, then belong to the
 * agent.
 */
export function defaultTourLinks(labels: { requestTour: string; contactAgent: string }): TourLink[] {
  return [
    { kind: "inquiry", label: labels.requestTour, intent: "tour_request", featured: true },
    { kind: "inquiry", label: labels.contactAgent, intent: "question", featured: false },
  ];
}

/**
 * Validates links from a form or the database. At most three, at most one
 * featured, every label 1 to 40 characters, every URL http(s).
 */
export function parseTourLinks(input: unknown): Result<TourLink[]> {
  if (!Array.isArray(input)) return err("TOUR_LINKS_INVALID", "Tour links must be a list.");
  if (input.length > MAX_TOUR_LINKS) {
    return err("TOUR_LINKS_TOO_MANY", `At most ${MAX_TOUR_LINKS} tour links.`);
  }
  const links: TourLink[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return err("TOUR_LINKS_INVALID", "A tour link is malformed.");
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (label.length < 1 || label.length > TOUR_LINK_LABEL_MAX) {
      return err("TOUR_LINK_LABEL", `Each label needs 1 to ${TOUR_LINK_LABEL_MAX} characters.`);
    }
    const featured = item.featured === true;
    if (item.kind === "inquiry") {
      if (item.intent !== "tour_request" && item.intent !== "question") {
        return err("TOUR_LINK_INTENT", "An inquiry link opens a tour request or a question.");
      }
      links.push({ kind: "inquiry", label, intent: item.intent, featured });
    } else {
      // Anything without kind "inquiry" must be a URL link.
      const url = parseHttpUrl(item.url);
      if (!url) return err("TOUR_LINK_URL", "Links must start with http:// or https://.");
      links.push({ kind: "url", label, url, featured });
    }
  }
  if (links.filter((link) => link.featured).length > 1) {
    return err("TOUR_LINKS_FEATURED", "Only one link can be featured.");
  }
  return ok(links);
}

/**
 * The links a buyer can use. URL links are re-checked on the way out: a row
 * edited by hand never went through parseTourLinks.
 */
export function usableTourLinks(links: readonly TourLink[] | null | undefined): TourLink[] {
  return (links ?? []).filter((link) => link.kind === "inquiry" || isHttpUrl(link.url));
}

/** The featured link, if any, and the rest in their saved order. */
export function splitTourLinks(links: TourLink[]): { featured: TourLink | null; others: TourLink[] } {
  const featured = links.find((link) => link.featured) ?? null;
  return { featured, others: links.filter((link) => link !== featured) };
}
