import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Edge-runtime Sentry init. This one matters here: src/middleware.ts (the locale redirect) runs on
// the edge, so an error there is invisible to the Node config. Same DSN guard, so it is inert with
// no SENTRY_DSN. Loaded from src/instrumentation.ts's register() on the edge runtime.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
