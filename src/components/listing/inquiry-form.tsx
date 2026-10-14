"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { InquirySource, InquirySurface } from "@/lib/listings/inquiry";
import type { InquiryIntent } from "@/lib/tour/tour-links";
import { useListing } from "./listing-provider";

export type InquiryFormLabels = {
  title: string;
  intentLabel: string;
  intentTour: string;
  intentQuestion: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  messageTour: string;
  messageQuestion: string;
  preferredTimes: string;
  preferredTimesHint: string;
  submit: string;
  sending: string;
  sent: string;
  sendAnother: string;
  error: string;
  networkError: string;
  privacy: string;
  honeypot: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string; field?: string };

const FIELD_FOR_CODE: Record<string, string> = {
  INQUIRY_NAME: "name",
  INQUIRY_EMAIL: "email",
  INQUIRY_PHONE: "phone",
  INQUIRY_MESSAGE: "message",
  INQUIRY_TIMES: "preferredTimes",
};

const INPUT =
  "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus-visible:border-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 aria-[invalid=true]:border-red-700";

/**
 * Soft lead capture (plans/03, plans/08 6.1 item 3): inline, no pop-up, no
 * pre-checked boxes. The message starts prefilled with the property (both
 * portals do this) and stays editable. After sending, the confirmation names
 * who will reply, and "Send another" stays on screen (BAM's rule: action
 * buttons never disappear after use).
 */
export function InquiryForm({
  slug,
  surface,
  place,
  agentName,
  agencyName,
  initialIntent = "tour_request",
  labels,
}: {
  slug: string;
  surface: InquirySurface;
  /** The address or area, for the prefilled message. */
  place: string;
  agentName: string;
  agencyName: string;
  /** From `?inquiry=` when the embed sent the buyer here. */
  initialIntent?: InquiryIntent;
  labels: InquiryFormLabels;
}) {
  const { inquiry, setFormInView } = useListing();
  const id = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());
  const [intent, setIntent] = useState<InquiryIntent>(initialIntent);
  const [source, setSource] = useState<InquirySource>("form");
  const defaultMessage = (next: InquiryIntent) =>
    (next === "tour_request" ? labels.messageTour : labels.messageQuestion).replace("{place}", place);
  const [message, setMessage] = useState(() => defaultMessage(initialIntent));
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Keep the default message in step with the intent, unless the buyer wrote their own.
  const changeIntent = (next: InquiryIntent) => {
    setMessage((current) => (current === defaultMessage(intent) ? defaultMessage(next) : current));
    setIntent(next);
  };

  // Opened from elsewhere on the page: take its intent and source, then focus.
  useEffect(() => {
    if (!inquiry) return;
    setSource(inquiry.source);
    setMessage((current) =>
      inquiry.prefill ?? (current === defaultMessage(intent) ? defaultMessage(inquiry.intent) : current),
    );
    setIntent(inquiry.intent);
    if (status.kind === "sent") setStatus({ kind: "idle" });
    const timer = window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 400);
    return () => window.clearTimeout(timer);
    // Only a new request should do this, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiry?.nonce]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setFormInView(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setFormInView]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      kind: intent,
      source,
      surface,
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      message: form.get("message"),
      preferredTimes: intent === "tour_request" ? form.get("preferredTimes") : null,
      website: form.get("website"),
      startedAt: startedAt.current,
    };
    setStatus({ kind: "sending" });
    try {
      const res = await fetch(`/api/listings/${slug}/inquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; code: string; error: string }
        | null;
      if (json?.ok) {
        setStatus({ kind: "sent", email: String(body.email ?? "") });
        return;
      }
      setStatus({
        kind: "error",
        message: json && !json.ok ? json.error : labels.error,
        field: json && !json.ok ? FIELD_FOR_CODE[json.code] : undefined,
      });
    } catch {
      setStatus({ kind: "error", message: labels.networkError });
    }
  }

  const invalid = (field: string) => (status.kind === "error" && status.field === field ? true : undefined);
  const errorId = `${id}-error`;

  return (
    <section
      ref={sectionRef}
      id="contact"
      aria-labelledby={`${id}-title`}
      className="scroll-mt-28 rounded-2xl border border-slate-200 p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold text-slate-900">
        {labels.title}
      </h2>

      {status.kind === "sent" ? (
        <div className="mt-4 space-y-4">
          <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-900">
            {labels.sent.replace("{agent}", agentName).replace("{email}", status.email)}
          </p>
          <button
            type="button"
            onClick={() => {
              startedAt.current = Date.now();
              setStatus({ kind: "idle" });
            }}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {labels.sendAnother}
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4" aria-describedby={status.kind === "error" ? errorId : undefined}>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">{labels.intentLabel}</legend>
            <div className="mt-2 inline-flex rounded-lg border border-slate-300 p-1">
              {(["tour_request", "question"] as const).map((value) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="intent"
                    value={value}
                    checked={intent === value}
                    onChange={() => changeIntent(value)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-slate-700 peer-checked:bg-slate-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900">
                    {value === "tour_request" ? labels.intentTour : labels.intentQuestion}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              {labels.name}
              <input ref={nameRef} name="name" autoComplete="name" required aria-invalid={invalid("name")} className={INPUT} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {labels.email}
              <input
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                aria-invalid={invalid("email")}
                className={INPUT}
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            {labels.phone}
            <input name="phone" type="tel" autoComplete="tel" aria-invalid={invalid("phone")} className={INPUT} />
          </label>
          {intent === "tour_request" ? (
            <label className="block text-sm font-medium text-slate-700">
              {labels.preferredTimes}
              <input
                name="preferredTimes"
                placeholder={labels.preferredTimesHint}
                aria-invalid={invalid("preferredTimes")}
                className={INPUT}
              />
            </label>
          ) : null}
          <label className="block text-sm font-medium text-slate-700">
            {labels.message}
            <textarea
              name="message"
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-invalid={invalid("message")}
              className={INPUT}
            />
          </label>
          {/* Honeypot: hidden from people and assistive tech, irresistible to bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              {labels.honeypot}
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {status.kind === "error" ? (
            <p id={errorId} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
              {status.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">{labels.privacy.replace("{agency}", agencyName)}</p>
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg px-6 text-base font-semibold shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60 sm:w-auto"
              style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
            >
              {status.kind === "sending" ? labels.sending : labels.submit}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
