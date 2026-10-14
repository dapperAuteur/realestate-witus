// Ported from wanderlearn-app src/components/virtual-tour/types.ts @ c7f5616, 2026-10-14
// (plans/08). Trimmed to what a listing tour uses: no audio, hunt keys,
// cross-tour links, 360 video, icon styling or generative-edit disclosures.
// Floor plans are new: one plan per floor instead of one map per tour.

import type { TourLink } from "@/lib/tour/tour-links";

export interface ScenePosition {
  yaw: number;
  pitch: number;
}

export interface SceneHotspot {
  id: string;
  position: ScenePosition;
  title: string;
  /** Plain text. The viewer escapes it before PSV renders it as HTML. */
  content?: string;
  /** http(s) only; re-checked when opened. */
  externalUrl?: string;
  /** Moments: only shown in this moment. Undefined = every moment. */
  momentId?: string;
}

export interface SceneLink {
  nodeId: string;
  /** Doorway label for the arrow's accessible name. */
  name?: string;
  /** Where the arrow sits in the scene that owns this link. */
  position?: ScenePosition;
  /**
   * Where the camera points on arrival, for a buyer who came through this
   * doorway. Falls back to the target scene's `startPosition`.
   */
  arrivalPosition?: ScenePosition;
  /** Clockwise turn of the arrow icon in degrees (multiples of 15). */
  arrowRotation?: number;
}

/** A scene's photo for one non-base moment ("Before", "Staged"). */
export interface SceneMomentPhoto {
  momentId: string;
  panorama: string;
  /** Degrees the photo is turned to line up with the base view. */
  headingOffsetDeg: number;
}

export interface TourScene {
  id: string;
  name: string;
  caption?: string;
  panorama: string;
  thumbnail?: string;
  startPosition?: ScenePosition;
  links?: SceneLink[];
  hotspots?: SceneHotspot[];
  /** Clockwise horizon correction, degrees. */
  rollOffsetDeg?: number;
  /** Lowest a buyer may look, degrees (negative is below the horizon). */
  minPitchDeg?: number;
  /** The floor this room is on. Undefined = not on any plan. */
  floorPlanId?: string;
  /** Pin on that floor's plan, normalized 0..1. */
  mapPosition?: { x: number; y: number };
  /** This scene's photos for other moments. Its own `panorama` is the base view. */
  moments?: SceneMomentPhoto[];
}

/** One floor's plan, as the viewer and the listing page need it. */
export interface TourFloorPlan {
  id: string;
  label: string;
  imageUrl: string;
  /** Intrinsic pixels: the one conversion point from normalized pins to MapPlugin pixels. */
  width: number;
  height: number;
}

/** One point on the tour's timeline. */
export interface TimelineMoment {
  id: string;
  label: string;
  isBase: boolean;
}

export interface VirtualTour {
  /** The listing slug. */
  slug: string;
  title: string;
  startSceneId: string;
  /** Already in visit order (build-tour sorts once, so every surface agrees). */
  scenes: TourScene[];
  /** Pinned in the viewer on every scene. */
  tourLinks?: TourLink[];
  /** Present only when the tour has a moment besides the base view. */
  timeline?: TimelineMoment[];
  /** In floor order. Present only when at least one floor has a pinned room. */
  floorPlans?: TourFloorPlan[];
}
