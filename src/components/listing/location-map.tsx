"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet + OpenStreetMap (plans/03: free, no key). Leaflet and the tiles load
 * only as the map nears the screen, so they never compete with the photos for
 * the first paint. A hidden address gets a ~1 km circle at rounded
 * coordinates and no pin: the area, never the house.
 *
 * OSM's public tiles are fine at our volume, with attribution; at real scale
 * move to a tile provider (OSM tile usage policy).
 */
export function LocationMap({
  lat,
  lng,
  approximate,
  label,
  loading,
  attribution,
}: {
  lat: number;
  lng: number;
  approximate: boolean;
  label: string;
  loading: string;
  attribution: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || map) return;
        observer.disconnect();
        const L = await import("leaflet");
        if (cancelled || !ref.current) return;
        map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }).setView(
          [lat, lng],
          approximate ? 14 : 16,
        );
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
        }).addTo(map);
        const color = getComputedStyle(ref.current).getPropertyValue("--brand-accent").trim() || "#0b6b57";
        if (approximate) {
          L.circle([lat, lng], { radius: 800, color, fillColor: color, fillOpacity: 0.15, weight: 2 }).addTo(map);
        } else {
          L.circleMarker([lat, lng], { radius: 10, color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 1 }).addTo(map);
        }
        setReady(true);
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      map?.remove();
    };
  }, [lat, lng, approximate]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200">
      <div ref={ref} role="region" aria-label={label} className="h-80 w-full bg-slate-100" />
      {!ready ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-600">
          {loading}
        </p>
      ) : null}
      <p className="sr-only">{attribution}</p>
    </div>
  );
}
