import type { Dictionary } from "@/lib/dictionaries";
import type { TenantRecord } from "@/lib/tenant";
import { templateFor } from "@/lib/templates";

// The agency landing on a tenant domain. Deliberately minimal until the
// listings workstream lands: it proves the domain, brand preset, font pair,
// and template all resolve end to end. Listing grid and featured tour render
// here next.

export function TenantHome({
  tenant,
  dict,
}: {
  tenant: TenantRecord;
  dict: Dictionary;
  lang: string;
}) {
  const template = templateFor(tenant.theme.templateKey);
  const name = tenant.theme.name ?? tenant.name;

  return (
    <main className={`mx-auto max-w-5xl px-4 py-16 ${template.t.page}`}>
      <h1 className={template.t.display}>{name}</h1>
      {tenant.tagline ? (
        <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          {tenant.tagline}
        </p>
      ) : null}
      <p className="mt-8 max-w-xl text-slate-600 dark:text-slate-400">
        {dict.home.listingsSoon}
      </p>
    </main>
  );
}
