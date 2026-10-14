import { ListingCard } from "@/components/listing/listing-card";
import type { Dictionary } from "@/lib/dictionaries";
import { listPublicListings } from "@/lib/listings/queries";
import type { TenantRecord } from "@/lib/tenant";
import { templateFor } from "@/lib/templates";

// The agency landing on a tenant domain: its brand, then its public listings
// (for sale, under offer, and sold ones kept live as portfolio pieces).
// Light-locked like the listing pages (plans/03): photography reads best on
// light chrome.

export async function TenantHome({
  tenant,
  dict,
  lang,
}: {
  tenant: TenantRecord;
  dict: Dictionary;
  lang: string;
}) {
  const template = templateFor(tenant.theme.templateKey);
  const name = tenant.theme.name ?? tenant.name;
  const listings = await listPublicListings(tenant.id).catch((error) => {
    // Before migration 0001 runs (user task 12) the tables don't exist yet.
    console.error("[tenant-home] listings unavailable", error);
    return [];
  });

  return (
    <main className={`mx-auto max-w-6xl bg-white px-4 py-12 text-slate-900 [color-scheme:light] ${template.t.page}`}>
      <h1 className={template.t.display}>{name}</h1>
      {tenant.tagline ? <p className="mt-4 max-w-xl text-lg text-slate-600">{tenant.tagline}</p> : null}

      <section aria-labelledby="listings-title" className="mt-12">
        <h2 id="listings-title" className="text-2xl font-semibold">
          {dict.home.listingsTitle}
        </h2>
        {listings.length ? (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <li key={listing.slug}>
                <ListingCard listing={listing} dict={dict} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 max-w-xl text-slate-600">{dict.home.noListings}</p>
        )}
      </section>
    </main>
  );
}
