// Decorative illustrations of the product, drawn in CSS so the marketing page
// ships no photography and no JS. They stand in for the real Photo Sphere
// Viewer until the engine port lands (workstream 3), and they are the honest
// shape of it: panorama, navigation hotspots, scene strip, fullscreen control.
//
// Both are aria-hidden with the surrounding prose carrying the meaning; the
// `label` prop is rendered screen-reader-only by the caller.

const PANORAMA =
  "linear-gradient(180deg, color-mix(in srgb, var(--brand-accent) 22%, #f8fafc) 0%, color-mix(in srgb, var(--brand-accent) 10%, #f1f5f9) 42%, color-mix(in srgb, var(--brand-accent) 30%, #e2e8f0) 43%, color-mix(in srgb, var(--brand-accent) 16%, #cbd5e1) 100%)";

/** A hotspot dot with the pulse ring the real viewer uses for navigation. */
function Hotspot({ className }: { className: string }) {
  return (
    <span className={`absolute block ${className}`}>
      <span
        className="block h-6 w-6 rounded-full border-2 border-white/90 shadow-md"
        style={{ background: "color-mix(in srgb, var(--brand-accent) 70%, white)" }}
      />
    </span>
  );
}

export function TourMock({ label, scene, scenes }: { label: string; scene: string; scenes: string[] }) {
  return (
    <div className="relative">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_40px_rgb(15_23_42/0.12)] dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Viewer stage */}
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]" style={{ background: PANORAMA }}>
          {/* Horizon furniture, suggested with soft blocks rather than fake photos. */}
          <span className="absolute bottom-[18%] left-[8%] h-[14%] w-[22%] rounded-lg bg-white/25" />
          <span className="absolute bottom-[16%] right-[10%] h-[22%] w-[18%] rounded-lg bg-white/20" />
          <span className="absolute bottom-[42%] left-[38%] h-[16%] w-[26%] rounded-md bg-white/15" />

          <Hotspot className="left-[24%] top-[52%]" />
          <Hotspot className="right-[22%] top-[46%]" />

          {/* Scene name, top left, the way the real chrome sits. */}
          <span className="absolute left-3 top-3 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-medium text-white">
            {scene}
          </span>
          {/* Fullscreen control, top right. */}
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-white stroke-2">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        {/* Scene strip */}
        <div className="flex gap-2 overflow-hidden border-t border-slate-200 p-3 dark:border-slate-800">
          {scenes.map((name, i) => (
            <span
              key={name}
              className="flex h-11 flex-1 items-end rounded-md px-2 pb-1 text-[10px] font-medium text-slate-600 dark:text-slate-300"
              style={{
                background:
                  i === 0
                    ? "color-mix(in srgb, var(--brand-accent) 20%, transparent)"
                    : "color-mix(in srgb, var(--brand-accent) 8%, transparent)",
                outline:
                  i === 0 ? "2px solid var(--brand-accent)" : "1px solid rgb(148 163 184 / 0.4)",
                outlineOffset: "-2px",
              }}
            >
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The same tour sitting inside somebody else's website. */
export function EmbedMock({ label, barCta }: { label: string; barCta: string }) {
  return (
    <div className="relative">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
      >
        {/* Host site chrome: their nav, their headline, our tour in the middle. */}
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-16 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="ml-auto h-2.5 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
          <span className="h-2.5 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
          <span className="h-2.5 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="mt-4 h-3 w-2/3 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="mt-2 h-2 w-1/2 rounded-full bg-slate-200 dark:bg-slate-800" />

        <div className="mt-4 overflow-hidden rounded-xl border-2 border-dashed" style={{ borderColor: "var(--brand-accent)" }}>
          <div className="relative aspect-[16/9] w-full" style={{ background: PANORAMA }}>
            <Hotspot className="left-[30%] top-[50%]" />
          </div>
          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 dark:bg-slate-900">
            <span className="h-2 w-24 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span
              className="text-[10px] font-semibold"
              style={{ color: "var(--brand-accent)" }}
            >
              {barCta}
            </span>
          </div>
        </div>

        <div className="mt-4 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="mt-2 h-2 w-4/5 rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
