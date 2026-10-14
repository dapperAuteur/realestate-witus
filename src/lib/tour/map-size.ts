// Ported from wanderlearn-app src/lib/map-size.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * How big the tour's mini-map should be, for a given viewport width.
 *
 * It used to be a flat 180px. On a 375px phone that is 48% of the screen
 * width sitting on top of the photograph — the mini-map is an orientation
 * aid, and at that size it competes with the thing it is meant to help you
 * look at. On a wide desktop the same 180px is unremarkable, which is why the
 * problem was easy to miss.
 *
 * The steps are deliberately coarse. A continuously-scaling size would need
 * recomputing on every resize frame for a control most visitors glance at
 * twice; three buckets get the same result and only change when the viewport
 * crosses a breakpoint.
 */
export function mapSizeForViewport(viewportWidth: number): string {
  // Phones. Roughly a quarter of a 375px screen, which reads as an inset
  // rather than an overlay.
  if (viewportWidth < 480) return "96px";
  // Large phones and small tablets.
  if (viewportWidth < 768) return "120px";
  // Everything else. Still smaller than the old flat 180px: the map is a
  // glance, not a panel.
  return "150px";
}
