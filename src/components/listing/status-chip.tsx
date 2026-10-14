/**
 * Sale status as a dot plus a word, never color alone (plans/08 6.2; both
 * portals do this). Sold stays positive: sold listings are the agency's
 * portfolio, not a dead end.
 */
const DOT: Record<string, string> = {
  for_sale: "bg-emerald-600",
  under_offer: "bg-amber-500",
  sold: "bg-sky-700",
  draft: "bg-slate-400",
  withdrawn: "bg-slate-400",
};

export function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[status] ?? "bg-slate-400"}`} />
      {label}
    </span>
  );
}
