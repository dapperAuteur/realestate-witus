"use client";

import type { ReactNode } from "react";
import type { InquirySource } from "@/lib/listings/inquiry";
import type { InquiryIntent } from "@/lib/tour/tour-links";
import { useListing } from "./listing-provider";

/** Any button elsewhere on the page that opens the inquiry form. */
export function ContactButton({
  intent,
  source = "form",
  prefill,
  className,
  style,
  children,
}: {
  intent: InquiryIntent;
  source?: InquirySource;
  prefill?: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const { openInquiry } = useListing();
  return (
    <button type="button" onClick={() => openInquiry(intent, source, prefill)} className={className} style={style}>
      {children}
    </button>
  );
}
