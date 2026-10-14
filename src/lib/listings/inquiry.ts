// Inquiry validation and the email an agent receives (plans/08: "Request a
// tour" and "Contact agent"). Pure: the route handler does the I/O.
//
// Lead capture stays soft (plans/03, plans/08 6.1 item 3): no pre-checked
// boxes, and we keep only what the buyer typed to get a reply. Bots get a
// quiet honeypot and a minimum fill time instead of a CAPTCHA a buyer on a
// phone has to fight.

import { err, ok, type Result } from "@/lib/result";
import type { InquiryIntent } from "@/lib/tour/tour-links";

export type InquirySource = "tour" | "action_panel" | "form";
export type InquirySurface = "page" | "embed";

export interface ParsedInquiry {
  kind: InquiryIntent;
  source: InquirySource;
  surface: InquirySurface;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  preferredTimes: string | null;
}

/** Faster than this from render to submit is a script, not a person. */
export const MIN_FILL_MS = 2500;

const LIMITS = { name: 120, email: 254, phone: 40, message: 2000, preferredTimes: 200 } as const;
// Deliberately loose: one @, something on each side, a dot in the domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? undefined : trimmed;
}

/**
 * Validates a submission. `SPAM` is a quiet code: the route answers it with
 * success and stores nothing, so a bot learns nothing.
 */
export function parseInquiry(raw: Record<string, unknown>, now: number): Result<ParsedInquiry> {
  // Honeypot: a field people never see. Anything in it is a bot.
  if (typeof raw.website === "string" && raw.website.trim() !== "") return err("SPAM", "Not accepted.");
  const startedAt = Number(raw.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < MIN_FILL_MS) {
    return err("SPAM", "Not accepted.");
  }

  const kind = raw.kind === "tour_request" || raw.kind === "question" ? raw.kind : null;
  if (!kind) return err("INQUIRY_KIND", "Choose a tour request or a question.");
  const source: InquirySource =
    raw.source === "tour" || raw.source === "action_panel" || raw.source === "form" ? raw.source : "form";
  const surface: InquirySurface = raw.surface === "embed" ? "embed" : "page";

  const name = text(raw.name, LIMITS.name);
  if (!name) return err("INQUIRY_NAME", "Add your name.");
  const email = text(raw.email, LIMITS.email);
  if (!email || !EMAIL.test(email)) return err("INQUIRY_EMAIL", "Add an email address we can reply to.");
  const phone = text(raw.phone, LIMITS.phone);
  if (phone === undefined) return err("INQUIRY_PHONE", "That phone number is too long.");
  const message = text(raw.message, LIMITS.message);
  if (message === undefined) return err("INQUIRY_MESSAGE", "Keep the message under 2,000 characters.");
  const preferredTimes = text(raw.preferredTimes, LIMITS.preferredTimes);
  if (preferredTimes === undefined) return err("INQUIRY_TIMES", "Keep the times under 200 characters.");

  return ok({
    kind,
    source,
    surface,
    name,
    email: email.toLowerCase(),
    phone,
    message,
    preferredTimes: kind === "tour_request" ? preferredTimes : null,
  });
}

/** The plain-text email to the agent. Reply-To is the buyer, so "Reply" just works. */
export function inquiryEmail(input: {
  inquiry: ParsedInquiry;
  listingTitle: string;
  listingUrl: string;
}): { subject: string; text: string } {
  const { inquiry } = input;
  const what = inquiry.kind === "tour_request" ? "Tour request" : "Question";
  const lines = [
    `${what} for ${input.listingTitle}`,
    "",
    `From: ${inquiry.name} <${inquiry.email}>`,
    inquiry.phone ? `Phone: ${inquiry.phone}` : null,
    inquiry.preferredTimes ? `Good times to visit: ${inquiry.preferredTimes}` : null,
    "",
    inquiry.message ?? "(No message.)",
    "",
    `Listing: ${input.listingUrl}`,
    `Sent from the ${inquiry.surface === "embed" ? "tour on your own site" : "listing page"}. Reply to this email to answer ${inquiry.name}.`,
  ].filter((line): line is string => line !== null);
  return { subject: `${what}: ${input.listingTitle}`, text: lines.join("\n") };
}
