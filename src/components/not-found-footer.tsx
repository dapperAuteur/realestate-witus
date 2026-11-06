"use client";

import { useParams } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { hasLocale } from "@/lib/locales";

/**
 * Footer for the [lang] 404 page. not-found boundaries get no params, so the locale comes from
 * the client router; an unknown value falls back to "en". Platform surface only: the caller
 * decides, because tenant pages never render the WitUS footer (white-label rule).
 */
export function NotFoundFooter() {
  const params = useParams<{ lang?: string }>();
  const lang = params?.lang && hasLocale(params.lang) ? params.lang : "en";
  return <SiteFooter lang={lang} />;
}
