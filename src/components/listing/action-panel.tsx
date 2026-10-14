"use client";

import { useListing } from "./listing-provider";

export type ActionPanelLabels = {
  requestTour: string;
  contactAgent: string;
  region: string;
};

const PRIMARY =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-base font-semibold shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";
const SECONDARY =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg border-2 bg-white px-5 text-base font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";
const ACCENT = { background: "var(--brand-accent)", color: "var(--brand-accent-fg)" };
const OUTLINE = { borderColor: "var(--brand-accent)", color: "var(--brand-accent)" };

/**
 * Desktop: the sticky card in the right column. Two buttons only (design
 * lock: Save and Share live in the header), under the agent's name.
 */
export function ActionCard({
  agentName,
  agencyName,
  agentImage,
  labels,
}: {
  agentName: string;
  agencyName: string;
  agentImage: string | null;
  labels: ActionPanelLabels;
}) {
  const { openInquiry } = useListing();
  return (
    <aside aria-label={labels.region} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        {agentImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agentImage} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700">
            {agentName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{agentName}</p>
          <p className="truncate text-sm text-slate-600">{agencyName}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <button type="button" onClick={() => openInquiry("tour_request", "action_panel")} className={PRIMARY} style={ACCENT}>
          {labels.requestTour}
        </button>
        <button type="button" onClick={() => openInquiry("question", "action_panel")} className={SECONDARY} style={OUTLINE}>
          {labels.contactAgent}
        </button>
      </div>
    </aside>
  );
}

/**
 * Phones: a sticky bottom bar. It steps aside while the tour or the form is on
 * screen, so it never covers the viewer's own controls or the Send button
 * (plans/08 section 11).
 */
export function ActionBar({ labels }: { labels: ActionPanelLabels }) {
  const { openInquiry, tourInView, formInView } = useListing();
  const hidden = tourInView || formInView;
  return (
    <div
      aria-label={labels.region}
      role="region"
      hidden={hidden}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md gap-3">
        <button type="button" onClick={() => openInquiry("tour_request", "action_panel")} className={PRIMARY} style={ACCENT}>
          {labels.requestTour}
        </button>
        <button type="button" onClick={() => openInquiry("question", "action_panel")} className={SECONDARY} style={OUTLINE}>
          {labels.contactAgent}
        </button>
      </div>
    </div>
  );
}
