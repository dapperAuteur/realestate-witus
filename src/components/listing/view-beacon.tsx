"use client";

import { useEffect } from "react";

/**
 * Counts a view without slowing anything down: sendBeacon survives the tab
 * closing and never blocks rendering. The server stores counts only.
 */
export function sendListingView(slug: string, surface: "page" | "embed", event: "page" | "tour"): void {
  const url = `/api/listings/${slug}/views`;
  const body = JSON.stringify({ surface, event });
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch(url, { method: "POST", body, keepalive: true }).catch(() => undefined);
}

/**
 * One page view per listing per tab session: a refresh or a Back press is the
 * same visit, so the agent's numbers stay honest.
 */
export function ViewBeacon({ slug, surface }: { slug: string; surface: "page" | "embed" }) {
  useEffect(() => {
    const key = `rw:viewed:${surface}:${slug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: count it anyway.
    }
    sendListingView(slug, surface, "page");
  }, [slug, surface]);
  return null;
}
