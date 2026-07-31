import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Server-runtime Sentry init (Better Stack ingests via the Sentry protocol, so the DSN is a Better
// Stack source DSN). Loaded from src/instrumentation.ts's register() on the Node runtime.
//
// GUARDED ON THE DSN: with no SENTRY_DSN set, init never runs and the SDK is inert, so the app
// builds and behaves exactly as before until BAM provisions the source and sets the var.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Errors only for now. No performance/tracing volume until BAM opts in.
    tracesSampleRate: 0,
    // Never auto-attach IP, cookies, or user email; the beforeSend scrub is the second line of defense.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
