import { notFound } from "next/navigation";

// Unmatched URLs under /[lang] land here so [lang]/not-found.tsx renders inside the
// [lang] layout, which carries the header and Sign in control. Without it Next falls
// back to the root not-found, which has no layout shell (witus docs/shared-ui-ux-dx.md,
// "Error pages keep the app shell").
export default function MissingPage(): never {
  notFound();
}
