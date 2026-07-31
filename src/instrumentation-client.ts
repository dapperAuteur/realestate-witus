import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Client-runtime Sentry init. Reads the PUBLIC DSN, which Next inlines at build time. Guarded: with
// no NEXT_PUBLIC_SENTRY_DSN the SDK is inert, so nothing is sent and nothing changes for visitors.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Errors only. No tracing and no session replay (privacy plus cost) until BAM opts in.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

// Instruments App Router client navigations for Sentry (a no-op when the SDK is not initialized).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
