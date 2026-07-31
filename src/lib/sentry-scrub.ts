import type { ErrorEvent } from "@sentry/nextjs";

// Sentry `beforeSend` scrubber.
//
// Multi-tenant safety: a crash report must never carry an agent's email, a magic-link or
// staff-invite token, a cookie, or an Authorization header off to a third party. This repo has no
// shared redaction helper, so the redactor below is self-contained and deliberately biased toward
// over-redacting: a stripped stack frame costs a click in the real logs, a leaked magic link costs
// someone their account.
//
// It never returns null. We still want the crash signal, just without the credentials.

/** Query-param names that carry (or plausibly carry) a bearer secret. Substring, case-insensitive. */
const SECRET_PARAM_RE =
  /(token|secret|code|otp|passcode|password|pwd|pin|key|jwt|sig|signature|hash|auth|credential|session|magic|invite|nonce)/i;

/** Path prefixes that are token-redemption endpoints by construction. */
const SECRET_PATH_RE =
  /^\/(api\/auth|api\/demo-login|invite|accept|reset|reset-password|set-password|magic-link|confirm|activate|unsubscribe)(\/|$)/i;

/** A path segment shaped like a generated token: long, hex / base64url / nanoid alphabet. */
const TOKENISH_SEGMENT_RE = /^[A-Za-z0-9_-]{16,}$/;

/** Absolute http(s) URLs. Trailing punctuation is excluded so prose survives intact. */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/** Email addresses, wherever they turn up (an error message, a failing query, a stack frame). */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** A labelled raw secret: `password: hunter2`, `token = abc123`, `api key is xyz`. */
const SECRET_LABEL_RE =
  /\b(pin|password|passcode|secret|token|api[-\s]?key|bearer|one[-\s]?time code|access code|verification code)\b\s*(?:is|:|=)\s*([^\s.,;'"]{3,})/gi;

export const REDACTED_LINK = "[redacted link]";
export const REDACTED_EMAIL = "[redacted email]";
export const REDACTED_SECRET = "[redacted]";

/**
 * Is this URL carrying a secret that must never leave the app?
 * Unparseable means unreasonable-about, which means redact.
 */
export function isSensitiveUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }

  for (const key of url.searchParams.keys()) {
    if (SECRET_PARAM_RE.test(key)) return true;
  }

  if (SECRET_PATH_RE.test(url.pathname)) return true;

  // Catches a future /whatever/<token> route nobody remembered to list above.
  return url.pathname.split("/").some((seg) => TOKENISH_SEGMENT_RE.test(seg));
}

/**
 * Remove bearer secrets and email addresses from a free-text string. Token-bearing URLs become
 * `[redacted link]`, emails `[redacted email]`, labelled raw secrets `[redacted]`. Everything else
 * survives so the message is still recognisably the error that fired.
 */
export function redactSecrets(text: string): string {
  let out = text.replace(URL_RE, (match) => (isSensitiveUrl(match) ? REDACTED_LINK : match));

  out = out.replace(SECRET_LABEL_RE, (_match, label: string, value: string) =>
    value.startsWith("[redacted") ? `${label}: ${value}` : `${label}: ${REDACTED_SECRET}`,
  );

  return out.replace(EMAIL_RE, REDACTED_EMAIL);
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrub = (s: string | undefined): string | undefined => (s ? redactSecrets(s) : s);

  if (event.message) event.message = scrub(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrub(ex.value);
  }

  // Never ship the account identity or the network origin.
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  // Request context: keep a scrubbed URL for triage, drop the credential-bearing parts.
  if (event.request) {
    if (typeof event.request.url === "string") event.request.url = scrub(event.request.url);
    if (typeof event.request.query_string === "string") {
      event.request.query_string = scrub(event.request.query_string);
    }
    delete event.request.cookies;
    const headers = event.request.headers as Record<string, string> | undefined;
    if (headers) {
      delete headers.cookie;
      delete headers.authorization;
      delete headers["set-cookie"];
    }
  }

  return event;
}
