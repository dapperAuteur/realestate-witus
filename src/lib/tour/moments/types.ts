// Ported from wanderlearn-app src/lib/moments/types.ts @ c7f5616, 2026-10-14 (plans/08).
/**
 * Moments: the portable contract (plans/15-scene-moments-over-time.md).
 *
 * Everything in src/lib/moments/ is plain data and pure functions: no Next.js,
 * no Drizzle, no dictionaries. It is written to be copied into another app
 * (RealEstate.WitUS before/after tours) with only a query adapter around it.
 */

/** One point on a tour's timeline. Exactly one per tour is the base view. */
export type Moment = {
  id: string;
  /** Free text the switcher shows: "1998", "Opening day", "Now". */
  label: string;
  /** ISO date (YYYY-MM-DD) or null. Used for sorting only. */
  occurredOn: string | null;
  sortOrder: number;
  /** The scene's own panorama. Created with the tour's first moment, labeled "Now" by default. */
  isBase: boolean;
};

/** A scene's photo for one non-base moment. */
export type MomentPanorama = {
  momentId: string;
  /** Whatever the viewer loads: a URL here, but the core never looks inside it. */
  panorama: string;
  /** Degrees the photo is turned to line up with the base view. */
  headingOffsetDeg: number;
};
