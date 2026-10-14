"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type TourViewerComponent from "./tour-viewer";

export type { PositionClick, TourViewerApi, TourViewerLabels } from "./tour-viewer";

// PSV touches window and WebGL at import time, so the viewer never renders on
// the server, and its ~600 KB stays out of every page until a tour is opened
// (plans/08 section 8: dynamic import, no SSR, behind a tap-to-load poster).
const TourViewer = dynamic(() => import("./tour-viewer"), {
  ssr: false,
  loading: () => <div aria-busy="true" className="h-full w-full animate-pulse bg-slate-900" />,
});

/** The listing tour viewer, client-only. Props are the viewer's own. */
export function Tour(props: ComponentProps<typeof TourViewerComponent>) {
  return <TourViewer {...props} />;
}
