"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { InquirySource } from "@/lib/listings/inquiry";
import type { InquiryIntent } from "@/lib/tour/tour-links";

// One listing page has several ways into the same two things: the inquiry
// form (sticky card, mobile bar, the button pinned in the tour, the agent
// card, the accessibility link) and the tour (the floor plan's rooms, the
// hero chips). This context is the one place they meet. `nonce` makes a
// repeat request (the same room twice) still count as new.

export interface InquiryRequest {
  intent: InquiryIntent;
  source: InquirySource;
  prefill?: string;
  nonce: number;
}

export interface TourRequest {
  sceneId: string | null;
  nonce: number;
}

interface ListingContextValue {
  inquiry: InquiryRequest | null;
  openInquiry: (intent: InquiryIntent, source: InquirySource, prefill?: string) => void;
  tourRequest: TourRequest | null;
  openTourAt: (sceneId: string | null) => void;
  /** While the tour is on screen, the mobile action bar steps aside (plans/08 risk: it covered the viewer's controls). */
  tourInView: boolean;
  setTourInView: (inView: boolean) => void;
  formInView: boolean;
  setFormInView: (inView: boolean) => void;
}

const ListingContext = createContext<ListingContextValue | null>(null);

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function ListingProvider({ children }: { children: ReactNode }) {
  const [inquiry, setInquiry] = useState<InquiryRequest | null>(null);
  const [tourRequest, setTourRequest] = useState<TourRequest | null>(null);
  const [tourInView, setTourInView] = useState(false);
  const [formInView, setFormInView] = useState(false);

  const openInquiry = useCallback((intent: InquiryIntent, source: InquirySource, prefill?: string) => {
    setInquiry((prev) => ({ intent, source, prefill, nonce: (prev?.nonce ?? 0) + 1 }));
    scrollToId("contact");
  }, []);

  const openTourAt = useCallback((sceneId: string | null) => {
    setTourRequest((prev) => ({ sceneId, nonce: (prev?.nonce ?? 0) + 1 }));
    scrollToId("tour");
  }, []);

  const value = useMemo(
    () => ({ inquiry, openInquiry, tourRequest, openTourAt, tourInView, setTourInView, formInView, setFormInView }),
    [inquiry, openInquiry, tourRequest, openTourAt, tourInView, formInView],
  );
  return <ListingContext.Provider value={value}>{children}</ListingContext.Provider>;
}

export function useListing(): ListingContextValue {
  const value = useContext(ListingContext);
  if (!value) throw new Error("useListing outside ListingProvider");
  return value;
}
