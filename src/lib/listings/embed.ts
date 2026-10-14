// Listing URLs and the embed snippet agents paste into their own sites
// (founding decision 4: embeds are public once a listing is live; no tokens,
// no domain locks in v1).

/** `origin` is scheme + host, e.g. "https://homes.osuproperty.com". */
export function listingPageUrl(origin: string, slug: string, lang = "en"): string {
  return `${origin}/${lang}/listings/${slug}`;
}

export function listingEmbedUrl(origin: string, slug: string): string {
  return `${origin}/embed/listings/${slug}`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * One paste-able line. A responsive box (full width, 16:10, never shorter
 * than 320px so a phone still gets a usable tour) holding our iframe. Inline
 * styles only: it has to look right inside ANY site, with no stylesheet of
 * ours on the page. `title` names the frame for screen readers.
 */
export function embedSnippet({ embedUrl, title }: { embedUrl: string; title: string }): string {
  return (
    `<div style="position:relative;width:100%;aspect-ratio:16/10;min-height:320px">` +
    `<iframe src="${escapeAttribute(embedUrl)}" title="${escapeAttribute(title)}" ` +
    `style="position:absolute;inset:0;width:100%;height:100%;border:0" loading="lazy" ` +
    `allow="fullscreen; gyroscope; accelerometer" allowfullscreen></iframe></div>`
  );
}
