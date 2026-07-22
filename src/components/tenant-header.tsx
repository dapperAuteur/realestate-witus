import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { TenantRecord } from "@/lib/tenant";

// Agency chrome on tenant sites. White-label: the wordmark is the AGENCY's,
// never RealEstate.WitUS. Listing navigation joins here with the listings
// workstream; today the wordmark is the only link.

export function TenantHeader({
  tenant,
  dict,
  lang,
}: {
  tenant: TenantRecord;
  dict: Dictionary;
  lang: string;
}) {
  const name = tenant.theme.name ?? tenant.name;
  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
        <Link
          href={`/${lang}`}
          className="inline-flex min-h-11 items-center text-lg font-bold [font-family:var(--font-heading)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {tenant.theme.wordmark ?? name}
          <span className="sr-only"> {dict.common.backHome}</span>
        </Link>
      </div>
    </header>
  );
}
