"use client";

// Ported from wanderlearn-app src/components/virtual-tour/virtual-tour-viewer.tsx
// @ c7f5616, 2026-10-14 (plans/08 phase B).
//
// Kept: accessible, keyboard-operable link arrows (with turned arrows),
// arrival headings, the per-scene view limit and horizon roll, Moments
// (Before / After), the tour links overlay, the floor-plan mini-map, `?scene=`
// URL sync with Back support, and the editor hooks (click capture, live roll
// and view-limit preview, rotate, jump).
//
// Left out (plans/08 section 4, "Not ported"): ambient and transition audio,
// hunt keys, cross-tour links, mixed 360 video, hotspot media dialogs, icon
// styling, scene-label and sound-description toggles, privacy-box overlays
// and drag handles, generative-edit disclosures, and analytics capture.
//
// New here: one floor plan per floor (src/lib/tour/floors.ts), hotspots as
// real buttons (Wanderlust's pins were divs a keyboard could not reach), and
// every agent-typed string escaped before PSV renders it as HTML.

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Viewer, type events } from "@photo-sphere-viewer/core";
import { MapPlugin } from "@photo-sphere-viewer/map-plugin";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import { VirtualTourPlugin } from "@photo-sphere-viewer/virtual-tour-plugin";
import { VisibleRangePlugin } from "@photo-sphere-viewer/visible-range-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import "@photo-sphere-viewer/map-plugin/index.css";
import { escapeHtml, escapeHtmlMultiline } from "@/lib/tour/escape-html";
import {
  fitZoomPercent,
  floorForScene,
  floorHotspots,
  MAP_MIN_ZOOM,
  nodeMapPosition,
  startFloorId,
} from "@/lib/tour/floors";
import { isHttpUrl } from "@/lib/tour/http-url";
import { mapSizeForViewport } from "@/lib/tour/map-size";
import { effectiveMoment, hotspotShowsIn } from "@/lib/tour/moments/moments";
import { planSceneUrl, sceneFromUrl, type SceneUrlSyncMode } from "@/lib/tour/scene-url-sync";
import type { InquiryIntent } from "@/lib/tour/tour-links";
import { clampPitchForViewLimit, verticalRangeFor } from "@/lib/tour/view-limit";
import { MomentSwitcher, type MomentSwitcherLabels } from "./moment-switcher";
import { TourLinksOverlay, type TourLinksLabels } from "./tour-links-overlay";
import type {
  SceneHotspot,
  SceneMomentPhoto,
  ScenePosition,
  TourFloorPlan,
  TourScene,
  VirtualTour,
} from "./types";

/** Every visible word, from the dictionary. No English fallbacks in here. */
export interface TourViewerLabels {
  /** Accessible name of the viewer. `{title}` is replaced. */
  application: string;
  /** Arrow name. `{name}` is the doorway label or the target room. */
  sceneLink: string;
  sceneLinkFallback: string;
  /** Shown over the panorama when a room fails to load. */
  loadErrorTitle: string;
  loadErrorBody: string;
  /** Announced when the mini-map changes floor. `{floor}` is replaced. */
  floorChanged: string;
  links: TourLinksLabels;
  moments: MomentSwitcherLabels;
}

/** Where a click landed on the panorama, for the admin's click-to-place editors. */
export interface PositionClick {
  yaw: number;
  pitch: number;
}

export interface TourViewerApi {
  getPosition(): ScenePosition;
  /** Jump straight to a room (the room strip, the floor plan). Unknown ids are ignored. */
  goToScene(sceneId: string): void;
  /** Point the camera, instantly. For editors previewing typed numbers. */
  rotateTo(position: ScenePosition): void;
  /** Live-preview horizon roll in degrees; null returns to the saved value. */
  setRoll(degrees: number | null): void;
  /** Live-preview the view limit in degrees; null removes it until the next room. */
  setMinPitch(degrees: number | null): void;
}

interface TourViewerProps {
  tour: VirtualTour;
  labels: TourViewerLabels;
  height?: string;
  className?: string;
  apiRef?: MutableRefObject<TourViewerApi | null>;
  /** Fires on every arrival, by arrow, room strip, map pin or Back. */
  onSceneChange?: (sceneId: string) => void;
  /** Keep `?scene=` on the room being viewed. "replace" in the embed (an iframe shares history). */
  sceneUrlSync?: SceneUrlSyncMode;
  /** Admin editors: report clicks on the panorama. */
  onPositionClick?: (position: PositionClick) => void;
  /** Opens the listing's inquiry form from a pinned action. Fullscreen is exited first. */
  onInquiry?: (intent: InquiryIntent) => void;
  /** Six-digit hex for hotspot pins, usually the tenant accent. Anything else falls back. */
  pinColor?: string;
}

const DEFAULT_ARROW_COLOR = "#ffffff";
const DEFAULT_PIN_COLOR = "#0b6b57";
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * PSV's own default link arrow, copied so the labeled button looks exactly
 * like the plugin's. RE-CHECK on any virtual-tour-plugin upgrade.
 */
const ARROW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<path fill-rule="even-odd" fill="currentColor" d="' +
  "M50,50 m45,0 a45,45 0 1,0 -90,0 a45,45 0 1,0 90,0 " +
  "M50,50 m38,0 a38,38 0 0,1 -76,0 a38,38 0 0,1 76,0 " +
  "M50,50 m30,0 a30,30 0 1,0 -60,0 a30,30 0 1,0 60,0 " +
  "M50,40 m2.5,-2.5 l17.5,17.5 a 2.5,2.5 0 0 1 -5,5 l-15,-15 l-15,15 " +
  "a 2.5,2.5 0 0 1 -5,-5 l17.5,-17.5 a 3.5,3.5 0 0 1 5,0" +
  '"/></svg>';

/** Drop pin. `fill` is validated hex before it gets here. */
function pinSvg(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><path d="M16 2C10 2 5 7 5 13c0 7 11 17 11 17s11-10 11-17c0-6-5-11-11-11z" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/><circle cx="16" cy="13" r="4" fill="#ffffff"/></svg>`;
}

/**
 * A node's sphere correction: the horizon roll, plus a moment photo's heading
 * offset as `pan` so a re-shoot lines up with the base view. Undefined when
 * there is nothing to correct, so PSV doesn't fight a zero.
 */
function sphereCorrectionFor(
  rollOffsetDeg: number | undefined,
  headingOffsetDeg: number | undefined,
): { roll?: string; pan?: string } | undefined {
  const roll = rollOffsetDeg ? `${rollOffsetDeg}deg` : undefined;
  const pan = headingOffsetDeg ? `${headingOffsetDeg}deg` : undefined;
  if (!roll && !pan) return undefined;
  return { ...(roll ? { roll } : {}), ...(pan ? { pan } : {}) };
}

function photoForMoment(scene: TourScene, momentId: string | null): SceneMomentPhoto | undefined {
  return momentId ? scene.moments?.find((photo) => photo.momentId === momentId) : undefined;
}

/** The navbar caption. Escaped: PSV writes it with innerHTML. */
function captionFor(scene: TourScene): string {
  const name = escapeHtml(scene.name);
  return scene.caption && scene.caption !== scene.name ? `${name} · ${escapeHtml(scene.caption)}` : name;
}

export default function TourViewer({
  tour,
  labels,
  height = "70vh",
  className,
  apiRef,
  onSceneChange,
  sceneUrlSync,
  onPositionClick,
  onInquiry,
  pinColor,
}: TourViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The element PSV sends fullscreen. Overlays that must survive fullscreen
  // portal into it; it only exists after mount.
  const [fullscreenHost, setFullscreenHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setFullscreenHost(containerRef.current);
  }, []);

  // ── Moments ──────────────────────────────────────────────────────────────
  // Node ids stay scene ids: switching time swaps each node's photo in place
  // (updateNode), so the room strip, the URL and the floor plan are untouched.
  // The chosen moment is global, so arrows keep it.
  const timeline = tour.timeline ?? [];
  const baseMomentId = timeline.find((moment) => moment.isBase)?.id ?? null;
  const [selectedMoment, setSelectedMoment] = useState<string | null>(baseMomentId);
  const selectedMomentRef = useRef<string | null>(baseMomentId);
  // Set while the CURRENT node reloads for a time switch, so the transition
  // keeps the view and node-changed skips the arrival work.
  const momentSwitchRef = useRef(false);
  const displayedPanoramaRef = useRef(new Map<string, string>());
  const [momentUnavailable, setMomentUnavailable] = useState(false);

  const [currentSceneId, setCurrentSceneId] = useState<string>(tour.startSceneId);
  // Spoken by a polite live region: hotspot text (PSV's notification is not
  // announced) and floor changes.
  const [announcement, setAnnouncement] = useState("");

  const viewerRef = useRef<Viewer | null>(null);
  // Restores the heading after a rebuild (every admin save changes `tour`),
  // but only on the same scene.
  const lastPositionRef = useRef<{ sceneId: string; yaw: number; pitch: number } | null>(null);
  // URL sync bookkeeping, in refs: writing the URL must never re-render.
  const sceneUrlSyncRef = useRef(sceneUrlSync);
  sceneUrlSyncRef.current = sceneUrlSync;
  const hasSyncedUrlRef = useRef(false);
  const poppingRef = useRef(false);
  // Callbacks read inside the construction effect without rebuilding the viewer.
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;
  const onInquiryRef = useRef(onInquiry);
  onInquiryRef.current = onInquiry;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  /** Moment-scoped hotspots show only while their moment is on screen. */
  const applyHotspotScoping = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const markers = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
    let currentId: string | undefined;
    try {
      currentId = viewer.getPlugin<VirtualTourPlugin>(VirtualTourPlugin)?.getCurrentNode()?.id;
    } catch {
      currentId = undefined;
    }
    const scene = tour.scenes.find((s) => s.id === currentId);
    const showing = effectiveMoment(
      selectedMomentRef.current,
      baseMomentId,
      new Set((scene?.moments ?? []).map((photo) => photo.momentId)),
    );
    for (const hotspot of scene?.hotspots ?? []) {
      if (!hotspot.momentId) continue;
      try {
        if (hotspotShowsIn(hotspot.momentId, showing)) markers?.showMarker(hotspot.id);
        else markers?.hideMarker(hotspot.id);
      } catch {
        // Not mounted yet mid-transition; the node-changed pass catches it.
      }
    }
  }, [tour.scenes, baseMomentId]);
  const applyHotspotScopingRef = useRef(applyHotspotScoping);
  applyHotspotScopingRef.current = applyHotspotScoping;

  /**
   * Switch the whole tour to another moment. Other rooms update quietly (no
   * reload until the buyer walks in); the room on screen reloads in place.
   */
  const selectMoment = useCallback(
    (momentId: string) => {
      selectedMomentRef.current = momentId;
      setSelectedMoment(momentId);
      setMomentUnavailable(false);
      const virtualTour = viewerRef.current?.getPlugin<VirtualTourPlugin>(VirtualTourPlugin);
      if (!virtualTour) return;
      let currentId: string | undefined;
      try {
        currentId = virtualTour.getCurrentNode()?.id;
      } catch {
        currentId = undefined;
      }
      let currentPatch: { id: string; panorama: string; sphereCorrection: object } | null = null;
      for (const scene of tour.scenes) {
        const photo = photoForMoment(scene, momentId);
        const panorama = photo?.panorama ?? scene.panorama;
        if ((displayedPanoramaRef.current.get(scene.id) ?? scene.panorama) === panorama) continue;
        displayedPanoramaRef.current.set(scene.id, panorama);
        const patch = {
          id: scene.id,
          panorama,
          // `{}` rather than undefined, so moving off a turned photo clears its pan.
          sphereCorrection: sphereCorrectionFor(scene.rollOffsetDeg, photo?.headingOffsetDeg) ?? {},
        };
        if (scene.id === currentId) {
          currentPatch = patch;
          continue;
        }
        try {
          virtualTour.updateNode(patch);
        } catch {
          // A scene the viewer dropped has no node.
        }
      }
      if (currentPatch) {
        momentSwitchRef.current = true;
        try {
          virtualTour.updateNode(currentPatch);
        } catch {
          momentSwitchRef.current = false;
        }
      } else {
        applyHotspotScopingRef.current();
      }
    },
    [tour.scenes],
  );
  const selectMomentRef = useRef(selectMoment);
  selectMomentRef.current = selectMoment;

  /** Pinned inquiry actions: leave fullscreen first, or the form opens behind it. */
  const handleInquiry = useCallback((intent: InquiryIntent) => {
    const viewer = viewerRef.current;
    try {
      if (viewer?.isFullscreenEnabled()) viewer.exitFullscreen();
    } catch {
      // Not in fullscreen.
    }
    onInquiryRef.current?.(intent);
  }, []);

  useEffect(() => {
    if (!containerRef.current || tour.scenes.length === 0) return;
    // Built on the next frame, not now. React's dev StrictMode mounts, unmounts
    // and remounts in one go; building synchronously let the throwaway first
    // viewer start its async first-room load, which then read a plugin that
    // destroy() had already emptied ("reading 'loadNode'"). The same race
    // exists in production when a tour unmounts while it is starting.
    let teardown: (() => void) | null = null;
    const frame = requestAnimationFrame(() => {
      teardown = mount();
    });
    return () => {
      cancelAnimationFrame(frame);
      teardown?.();
    };

    function mount(): () => void {
      const container = containerRef.current;
      if (!container) return () => {};
      const scenes = tour.scenes;
      const startScene = scenes.find((s) => s.id === tour.startSceneId) ?? scenes[0];
      const arrowColor = DEFAULT_ARROW_COLOR;
      const pinFill = pinColor && HEX.test(pinColor) ? pinColor : DEFAULT_PIN_COLOR;

      // ── Floors ─────────────────────────────────────────────────────────────
      const floorPlans: TourFloorPlan[] = tour.floorPlans ?? [];
      const plansById = new Map(floorPlans.map((plan) => [plan.id, plan]));
      const floorIds = floorPlans.map((plan) => plan.id);
      let currentFloorId = startFloorId(scenes, floorIds, startScene.id);
      const startFloor = currentFloorId ? plansById.get(currentFloorId) : undefined;
      // Escaped names for every tooltip PSV renders as HTML.
      const escapedScenes = scenes.map((scene) => ({ ...scene, name: escapeHtml(scene.name) }));

      // ── Arrows ─────────────────────────────────────────────────────────────
      // PSV's default arrow is a nameless button. arrowStyle.element builds a
      // labeled one, and Enter/Space navigates (PSV only listens for pointer
      // clicks on the viewer). `event.detail === 0` is a keyboard activation;
      // real clicks flow on to PSV so nothing navigates twice.
      const sceneNameById = new Map(scenes.map((scene) => [scene.id, scene.name]));
      const arrowLabelFor = (link: { nodeId: string; name?: string }) => {
        const target = link.name?.trim() || sceneNameById.get(link.nodeId);
        const current = labelsRef.current;
        return target ? current.sceneLink.replace("{name}", target) : current.sceneLinkFallback;
      };
      let virtualTourPlugin: VirtualTourPlugin | null = null;
      const buildArrowElement = (link: { nodeId: string; name?: string; data?: { rotation?: number } }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "psv-virtual-tour-arrow";
        button.setAttribute("aria-label", arrowLabelFor(link));
        button.innerHTML = ARROW_SVG;
        // The turn goes on the icon: PSV rewrites the button's own transform every frame.
        const rotation = link.data?.rotation;
        const icon = button.firstElementChild as (Element & ElementCSSInlineStyle) | null;
        if (rotation && icon) {
          icon.style.transform = `rotate(${rotation}deg)`;
          icon.style.transformOrigin = "50% 50%";
        }
        button.addEventListener("click", (event) => {
          if (event.detail !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          void virtualTourPlugin?.setCurrentNode(link.nodeId);
        });
        return button;
      };

      // ── Hotspots ───────────────────────────────────────────────────────────
      const openHotspot = (hotspot: SceneHotspot) => {
        if (hotspot.externalUrl) {
          // Re-checked here as well as on save.
          if (isHttpUrl(hotspot.externalUrl)) {
            window.open(hotspot.externalUrl, "_blank", "noopener,noreferrer");
          }
          return;
        }
        const text = hotspot.content?.trim();
        if (text) {
          viewer.notification.show({ content: escapeHtmlMultiline(text), timeout: 6000 });
          setAnnouncement(`${hotspot.title}. ${text}`);
        }
      };
      // Real buttons, so a keyboard can reach them and a screen reader names them.
      const buildHotspotElement = (hotspot: SceneHotspot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rw-hotspot";
        button.setAttribute("aria-label", hotspot.title);
        button.innerHTML = pinSvg(pinFill);
        button.addEventListener("click", (event) => {
          if (event.detail !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          openHotspot(hotspot);
        });
        return button;
      };

      const sceneToNode = (scene: TourScene) => {
        const photo = photoForMoment(scene, selectedMomentRef.current);
        return {
          id: scene.id,
          panorama: photo?.panorama ?? scene.panorama,
          thumbnail: scene.thumbnail,
          name: escapeHtml(scene.name),
          // Always defined: PSV otherwise inherits the INITIAL caption on every
          // setPanorama and the navbar stays stuck on the start room's name.
          caption: captionFor(scene),
          sphereCorrection: sphereCorrectionFor(scene.rollOffsetDeg, photo?.headingOffsetDeg),
          map: nodeMapPosition(scene, plansById),
          links: (scene.links ?? []).map((link) => ({
            nodeId: link.nodeId,
            name: link.name ? escapeHtml(link.name) : undefined,
            position: link.position,
            ...(link.arrowRotation ? { data: { rotation: link.arrowRotation } } : {}),
          })),
          markers: (scene.hotspots ?? []).map((hotspot) => ({
            id: hotspot.id,
            position: hotspot.position,
            element: buildHotspotElement(hotspot),
            // 44px target (BAM's rule) around the 32px pin; see .rw-hotspot.
            size: { width: 44, height: 44 },
            anchor: "bottom center",
            tooltip: escapeHtml(hotspot.title),
            data: { hotspotId: hotspot.id },
          })),
        };
      };

      // ── Transitions ────────────────────────────────────────────────────────
      const reducedMotion =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const arrivalPositionFor = (toId: string, fromId?: string | null): ScenePosition | undefined => {
        const link = fromId
          ? scenes.find((s) => s.id === fromId)?.links?.find((l) => l.nodeId === toId)
          : undefined;
        return link?.arrivalPosition ?? scenes.find((s) => s.id === toId)?.startPosition;
      };
      let viewerForTransitions: Viewer | null = null;
      // Arrival orientation is applied DURING the swap (rotateTo), so the new
      // room is composited already facing the right way: a cut, not a spin.
      const transitionOptions = (
        toNode: { id: string },
        fromNode?: { id: string },
        fromLink?: { position?: unknown },
      ) => {
        if (momentSwitchRef.current && fromNode && toNode.id === fromNode.id) {
          // A time switch reloads the SAME room: keep the view, cross-fade.
          return {
            effect: (reducedMotion ? "none" : "fade") as "none" | "fade",
            speed: 600,
            rotation: false,
            showLoader: false,
            ...(viewerForTransitions ? { rotateTo: viewerForTransitions.getPosition() } : {}),
          };
        }
        const arrival = arrivalPositionFor(toNode.id, fromNode?.id);
        // A room with a view limit is never composited looking at the hidden part.
        const limit = scenes.find((s) => s.id === toNode.id)?.minPitchDeg;
        let rotateTo = arrival;
        if (limit !== undefined && viewerForTransitions) {
          const linkPosition = fromLink?.position as { yaw?: unknown; pitch?: unknown } | undefined;
          const base =
            arrival ??
            (typeof linkPosition?.yaw === "number" && typeof linkPosition?.pitch === "number"
              ? { yaw: linkPosition.yaw, pitch: linkPosition.pitch }
              : viewerForTransitions.getPosition());
          const vFovDeg = viewerForTransitions.dataHelper.zoomLevelToFov(viewerForTransitions.getZoomLevel());
          rotateTo = { yaw: base.yaw, pitch: clampPitchForViewLimit(base.pitch, limit, vFovDeg) };
        }
        return {
          effect: (reducedMotion ? "none" : "fade") as "none" | "fade",
          speed: "5rpm",
          rotation: false,
          showLoader: true,
          ...(rotateTo ? { rotateTo } : {}),
        };
      };

      const startRange = verticalRangeFor(startScene.minPitchDeg);
      const visibleRangeEntry: [typeof VisibleRangePlugin, Record<string, unknown>] = [
        VisibleRangePlugin,
        startRange ? { verticalRange: startRange } : {},
      ];
      const mapSizePx = () => parseInt(mapSizeForViewport(window.innerWidth), 10);
      const mapPluginEntry: [typeof MapPlugin, Record<string, unknown>][] = startFloor
        ? [
            [
              MapPlugin,
              {
                position: "bottom left",
                shape: "round",
                size: mapSizeForViewport(window.innerWidth),
                minimizeOnHotspotClick: true,
                // A floor plan stays as drawn; the view cone turns instead.
                // A spinning plan is how buyers get lost.
                static: true,
                minZoom: MAP_MIN_ZOOM,
                defaultZoom: fitZoomPercent(startFloor, mapSizePx()),
                spotStyle: { color: pinFill, size: 14, borderColor: "#ffffff", borderSize: 2 },
              },
            ],
          ]
        : [];

      displayedPanoramaRef.current = new Map(
        scenes.map((s) => [s.id, photoForMoment(s, selectedMomentRef.current)?.panorama ?? s.panorama]),
      );
      const tourPluginConfig: Record<string, unknown> = {
        positionMode: "manual",
        // Flat markers at the exact yaw/pitch the editor placed.
        renderMode: "2d",
        arrowStyle: { element: buildArrowElement, style: { color: arrowColor } },
        transitionOptions,
        nodes: scenes.map(sceneToNode),
        startNodeId: startScene.id,
      };
      if (startFloor) tourPluginConfig.map = { imageUrl: startFloor.imageUrl };

      const defaultPosition = startScene.startPosition;
      const viewer = new Viewer({
        container,
        navbar: ["zoom", "move", "caption", "fullscreen"],
        defaultZoomLvl: 30,
        ...(defaultPosition ? { defaultYaw: defaultPosition.yaw, defaultPitch: defaultPosition.pitch } : {}),
        plugins: [[MarkersPlugin, {}], visibleRangeEntry, ...mapPluginEntry, [VirtualTourPlugin, tourPluginConfig]],
      });
      viewerRef.current = viewer;
      viewerForTransitions = viewer;
      const visibleRange = viewer.getPlugin<VisibleRangePlugin>(VisibleRangePlugin);
      const mapPlugin = startFloor ? viewer.getPlugin<MapPlugin>(MapPlugin) : null;
      virtualTourPlugin = viewer.getPlugin<VirtualTourPlugin>(VirtualTourPlugin);

      /**
       * Show the floor the buyer is on: swap the plan image when the floor
       * changes, and pin only that floor's rooms (the plugin pins every node).
       */
      const applyFloor = (sceneId: string) => {
        if (!mapPlugin) return;
        const nextFloorId = floorForScene(scenes, floorIds, sceneId, currentFloorId);
        const plan = nextFloorId ? plansById.get(nextFloorId) : undefined;
        if (!plan) return;
        if (nextFloorId !== currentFloorId) {
          const pin = nodeMapPosition(scenes.find((s) => s.id === sceneId) ?? { id: "", name: "" }, plansById);
          mapPlugin.setImage(plan.imageUrl, pin || undefined);
          mapPlugin.setZoom(fitZoomPercent(plan, mapSizePx()));
          currentFloorId = nextFloorId;
          setAnnouncement(labelsRef.current.floorChanged.replace("{floor}", plan.label));
        }
        mapPlugin.setHotspots(floorHotspots(escapedScenes, plan) as Parameters<MapPlugin["setHotspots"]>[0]);
      };

      if (apiRef) {
        apiRef.current = {
          getPosition: () => {
            const pos = viewer.getPosition();
            return { yaw: pos.yaw, pitch: pos.pitch };
          },
          goToScene: (sceneId) => {
            // setCurrentNode throws inside PSV on an unknown id.
            if (!scenes.some((scene) => scene.id === sceneId)) return;
            void virtualTourPlugin?.setCurrentNode(sceneId);
          },
          rotateTo: (position) => viewer.rotate(position),
          setRoll: (degrees) => {
            viewer.setOption("sphereCorrection", degrees === null ? {} : { roll: `${degrees}deg` });
          },
          setMinPitch: (degrees) => {
            visibleRange?.setVerticalRange(verticalRangeFor(degrees));
          },
        };
      }

      let currentId = startScene.id;
      const handleNodeChanged = (event: { node: { id: string }; fromNode?: { id: string } | null }) => {
        const scene = scenes.find((s) => s.id === event.node.id);
        if (momentSwitchRef.current && event.fromNode?.id === event.node.id) {
          // A time switch, not an arrival: no URL write, no scene change.
          momentSwitchRef.current = false;
          applyHotspotScopingRef.current();
          if (scene) visibleRange?.setVerticalRange(verticalRangeFor(scene.minPitchDeg));
          return;
        }
        applyHotspotScopingRef.current();
        if (!scene) return;
        // Applied on arrival: the arrival heading was pre-clamped in transitionOptions.
        visibleRange?.setVerticalRange(verticalRangeFor(scene.minPitchDeg));
        applyFloor(scene.id);
        currentId = scene.id;
        setCurrentSceneId(scene.id);
        onSceneChangeRef.current?.(scene.id);
        if (poppingRef.current) {
          // Arrived because of Back: the URL is already right.
          poppingRef.current = false;
          return;
        }
        const mode = sceneUrlSyncRef.current;
        if (!mode) return;
        const action = planSceneUrl(window.location.href, scene.id, mode, hasSyncedUrlRef.current);
        hasSyncedUrlRef.current = true;
        if (action.kind === "push") window.history.pushState(null, "", action.url);
        else if (action.kind === "replace") window.history.replaceState(null, "", action.url);
      };
      virtualTourPlugin?.addEventListener("node-changed", handleNodeChanged as never);
      // The first floor's pins, once the viewer is up (the plugin pins every node at init).
      const handleReady = () => applyFloor(currentId);
      viewer.addEventListener("ready", handleReady, { once: true });

      const remembered = lastPositionRef.current;
      if (remembered && remembered.sceneId === startScene.id) {
        viewer.addEventListener(
          "ready",
          () => {
            try {
              viewer.rotate({ yaw: remembered.yaw, pitch: remembered.pitch });
            } catch {
              // Not worth breaking the viewer over a heading.
            }
          },
          { once: true },
        );
      }

      // Pointer clicks on a hotspot reach PSV's select-marker; keyboard ones were handled above.
      const markersPlugin = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
      let lastSelect: { id: string; at: number } | null = null;
      const handleSelectMarker = (event: { marker: { id?: string; config?: { id?: string } } }) => {
        const markerId = event.marker.id ?? event.marker.config?.id ?? "";
        // Touch fires select twice (touchend + synthesized click).
        const now = Date.now();
        if (lastSelect && lastSelect.id === markerId && now - lastSelect.at < 500) return;
        lastSelect = { id: markerId, at: now };
        const hotspot = scenes.find((s) => s.id === currentId)?.hotspots?.find((h) => h.id === markerId);
        if (hotspot) openHotspot(hotspot);
      };
      markersPlugin?.addEventListener("select-marker", handleSelectMarker as never);

      const handleClick = (event: events.ClickEvent) => {
        if (event.data.rightclick) return;
        onPositionClick?.({ yaw: event.data.yaw, pitch: event.data.pitch });
      };
      if (onPositionClick) viewer.addEventListener("click", handleClick);

      const handlePanoramaError = (event: events.PanoramaErrorEvent) => {
        const source = typeof event.panorama === "string" ? event.panorama : "";
        console.error("[tour] panorama load failed", { source, error: event.error });
        // A moment photo that won't load must not black out the tour: back to
        // the base view, and say why.
        const isMomentPhoto =
          source !== "" && scenes.some((scene) => scene.moments?.some((photo) => photo.panorama === source));
        if (isMomentPhoto && baseMomentId) {
          momentSwitchRef.current = false;
          selectMomentRef.current(baseMomentId);
          setMomentUnavailable(true);
          return;
        }
        viewer.overlay.show({
          id: "tour-panorama-error",
          title: escapeHtml(labelsRef.current.loadErrorTitle),
          text: escapeHtml(labelsRef.current.loadErrorBody),
        });
      };
      viewer.addEventListener("panorama-error", handlePanoramaError);

      // Rotating a phone crosses a breakpoint without a rebuild.
      const handleResize = () => {
        if (!mapPlugin) return;
        mapPlugin.setOptions({ size: mapSizeForViewport(window.innerWidth) });
        const plan = currentFloorId ? plansById.get(currentFloorId) : undefined;
        if (plan) mapPlugin.setZoom(fitZoomPercent(plan, mapSizePx()));
      };
      if (mapPlugin) window.addEventListener("resize", handleResize);

      // Back and Forward, only when this viewer owns the URL.
      const handlePopState = () => {
        if (!sceneUrlSyncRef.current) return;
        const target =
          sceneFromUrl(
            window.location.href,
            scenes.map((s) => s.id),
          ) ?? startScene.id;
        if (target === currentId) return;
        poppingRef.current = true;
        void Promise.resolve(virtualTourPlugin?.setCurrentNode(target)).catch(() => {
          poppingRef.current = false;
        });
      };
      if (sceneUrlSync) window.addEventListener("popstate", handlePopState);

      return () => {
        if (onPositionClick) viewer.removeEventListener("click", handleClick);
        viewer.removeEventListener("panorama-error", handlePanoramaError);
        viewer.removeEventListener("ready", handleReady);
        if (mapPlugin) window.removeEventListener("resize", handleResize);
        window.removeEventListener("popstate", handlePopState);
        virtualTourPlugin?.removeEventListener("node-changed", handleNodeChanged as never);
        markersPlugin?.removeEventListener("select-marker", handleSelectMarker as never);
        try {
          const pos = viewer.getPosition();
          lastPositionRef.current = { sceneId: currentId, yaw: pos.yaw, pitch: pos.pitch };
        } catch {
          // Torn down mid-initialization: nothing to remember.
        }
        viewer.destroy();
        viewerRef.current = null;
        if (apiRef) apiRef.current = null;
      };
    }
    // Rebuilds only when the tour itself changes. Labels and callbacks are read
    // through refs so a re-render never reloads the panorama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, onPositionClick, apiRef, pinColor, sceneUrlSync]);

  // Moments, for the room on screen.
  const currentScene = tour.scenes.find((s) => s.id === currentSceneId);
  const currentPhotoIds = new Set((currentScene?.moments ?? []).map((photo) => photo.momentId));
  const momentOptions = timeline.filter((moment) => moment.isBase || currentPhotoIds.has(moment.id));
  const showingMoment = effectiveMoment(selectedMoment, baseMomentId, currentPhotoIds);
  const chosenMoment = timeline.find((moment) => moment.id === selectedMoment);
  const momentFallbackText =
    chosenMoment && !chosenMoment.isBase && showingMoment !== chosenMoment.id
      ? labels.moments.fallback
          .replace("{moment}", chosenMoment.label)
          .replace("{base}", timeline.find((moment) => moment.isBase)?.label ?? "")
      : null;

  return (
    <div className="relative" style={{ width: "100%", height }}>
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height: "100%", position: "relative" }}
        role="application"
        aria-label={labels.application.replace("{title}", tour.title)}
      />
      {fullscreenHost && tour.tourLinks?.length
        ? createPortal(
            <TourLinksOverlay
              links={tour.tourLinks}
              labels={labels.links}
              onInquiry={onInquiry ? handleInquiry : undefined}
            />,
            fullscreenHost,
          )
        : null}
      {fullscreenHost
        ? createPortal(
            <div className="pointer-events-none absolute left-2 top-2 z-[95] flex max-w-[calc(100%-1rem)] flex-col items-start gap-2 max-sm:top-16">
              {momentOptions.length > 1 && showingMoment ? (
                <div className="pointer-events-auto">
                  <MomentSwitcher
                    options={momentOptions}
                    value={showingMoment}
                    onChange={selectMoment}
                    labels={labels.moments}
                  />
                </div>
              ) : null}
              <div role="status" aria-live="polite">
                {momentUnavailable || momentFallbackText ? (
                  <p className="rounded-md bg-black/75 px-3 py-2 text-xs text-white">
                    {momentUnavailable ? labels.moments.unavailable : momentFallbackText}
                  </p>
                ) : null}
              </div>
            </div>,
            fullscreenHost,
          )
        : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
