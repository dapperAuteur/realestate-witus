"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Last-resort 500 boundary (root layout crashed, so this renders its own
// <html>). Client boundary: literal strings are the sanctioned exception.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report the root crash for a real stack trace. A no-op when no DSN is configured.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#ffffff",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: "28rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", color: "#475569" }}>
            The page hit an unexpected error. Nothing was charged.
          </p>
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "0 1.5rem",
                borderRadius: "9999px",
                border: "1px solid #cbd5e1",
                fontWeight: 600,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A full page load on purpose: after an error the client router may be what broke. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 1.5rem",
                borderRadius: "9999px",
                border: "1px solid #cbd5e1",
                fontWeight: 600,
                color: "inherit",
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
