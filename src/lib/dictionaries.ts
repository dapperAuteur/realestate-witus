import "server-only";
import type en from "@/dictionaries/en.json";

// en.json is the source of truth; the Dictionary type is inferred from it
// (wanderlearn pattern). Spanish lands as a hand-translated es.json in the
// same shape — never machine-translated (ecosystem rule).

export type Dictionary = typeof en;

export { LOCALES, hasLocale, type Locale } from "@/lib/locales";
import type { Locale } from "@/lib/locales";

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("@/dictionaries/en.json").then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
