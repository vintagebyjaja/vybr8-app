"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Street-level basemap for the Vybe Map, drawn by Mapbox GL JS.
 * The library loads from Mapbox's own CDN only when a token is configured, so nothing extra ships to the app bundle.
 * Pins stay ordinary React buttons: each one renders (through a portal) into a Mapbox marker that follows the map.
 */
const GL_VERSION = "v3.8.0";
const STYLE = "mapbox://styles/mapbox/dark-v11";

export type StreetPin = { key: string; lat: number; lng: number; node: ReactNode; offset?: [number, number]; z?: number };
type Bounds = { north: number; south: number; east: number; west: number };

type GLMarker = { setLngLat(ll: [number, number]): GLMarker; setOffset(o: [number, number]): GLMarker; addTo(m: GLMap): GLMarker; remove(): void };
type GLMap = {
  remove(): void;
  resize(): void;
  fitBounds(b: [[number, number], [number, number]], o?: Record<string, unknown>): void;
  addControl(c: unknown, position?: string): void;
  on(event: string, f: (e: { error?: { status?: number } }) => void): void;
  getZoom(): number;
  once(event: string, f: () => void): void;
};
type GL = {
  accessToken: string;
  Map: new (o: Record<string, unknown>) => GLMap;
  Marker: new (o: Record<string, unknown>) => GLMarker;
  NavigationControl: new (o?: Record<string, unknown>) => unknown;
};

let loader: Promise<GL> | null = null;
function loadGL(): Promise<GL> {
  const w = window as unknown as { mapboxgl?: GL };
  if (w.mapboxgl) return Promise.resolve(w.mapboxgl);
  loader ??= new Promise<GL>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `https://api.mapbox.com/mapbox-gl-js/${GL_VERSION}/mapbox-gl.css`;
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = `https://api.mapbox.com/mapbox-gl-js/${GL_VERSION}/mapbox-gl.js`;
    script.async = true;
    script.onload = () => (w.mapboxgl ? resolve(w.mapboxgl) : reject(new Error("Mapbox did not load")));
    script.onerror = () => {
      loader = null;
      reject(new Error("Mapbox did not load"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

const toBox = (b: Bounds): [[number, number], [number, number]] => [[b.west, b.south], [b.east, b.north]];

export function StreetMap({ token, bounds, pins, onFail }: { token: string; bounds: Bounds; pins: StreetPin[]; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const gl = useRef<GL | null>(null);
  const failed = useRef(onFail);
  failed.current = onFail;
  const markers = useRef(new Map<string, { marker: GLMarker; el: HTMLDivElement }>());
  const [map, setMap] = useState<GLMap | null>(null);
  const [zoom, setZoom] = useState<"far" | "mid" | "near">("far");
  const [els, setEls] = useState<Map<string, HTMLDivElement>>(() => new Map());
  const boundsKey = `${bounds.north},${bounds.south},${bounds.east},${bounds.west}`;

  // Create the map once per token.
  useEffect(() => {
    let cancelled = false;
    let created: GLMap | null = null;
    let giveUp = 0;
    const current = markers.current;
    loadGL()
      .then((lib) => {
        if (cancelled || !box.current) return;
        lib.accessToken = token;
        gl.current = lib;
        created = new lib.Map({
          container: box.current,
          style: STYLE,
          bounds: toBox(bounds),
          fitBoundsOptions: { padding: 24 },
          cooperativeGestures: true, // one finger scrolls the page, two fingers move the map
          dragRotate: false,
          pitchWithRotate: false,
        });
        created.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        // Fall back to the frequency map only if Mapbox never even got its map style (blocked token, no network).
        // Once the style arrives the map works; tiles keep streaming in on slow phones, so we don't give up on them.
        // A hidden tab doesn't draw, so the clock only runs while the page is on screen.
        let waited = 0;
        const tick = () => {
          if (!document.hidden) waited += 1;
          if (waited >= 30) failed.current();
          else giveUp = window.setTimeout(tick, 1000);
        };
        giveUp = window.setTimeout(tick, 1000);
        const ready = () => window.clearTimeout(giveUp);
        created.once("style.load", ready);
        created.once("load", () => {
          ready();
          created?.resize();
        });
        // Pins shrink to small icons when the whole city is showing, and grow as you zoom in.
        const zoomLevel = () => {
          const z = created?.getZoom() ?? 11;
          setZoom(z < 12.5 ? "far" : z < 14.5 ? "mid" : "near");
        };
        created.on("zoomend", zoomLevel);
        created.once("load", zoomLevel);
        created.on("error", (e) => {
          // A bad or restricted token: fall back to the frequency map instead of a blank box.
          if (e.error?.status === 401 || e.error?.status === 403) failed.current();
        });
        setMap(created);
      })
      .catch(() => {
        if (!cancelled) failed.current();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      current.forEach((m) => m.marker.remove());
      current.clear();
      created?.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds changes are handled by the fitBounds effect below
  }, [token]);

  // New city: fly to it.
  useEffect(() => {
    map?.fitBounds(toBox(bounds), { padding: 24, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boundsKey captures bounds
  }, [map, boundsKey]);

  // Keep one Mapbox marker per pin, then portal each pin's React node into its marker.
  useEffect(() => {
    const lib = gl.current;
    if (!map || !lib) return;
    const seen = new Set<string>();
    const next = new Map<string, HTMLDivElement>();
    for (const p of pins) {
      seen.add(p.key);
      let entry = markers.current.get(p.key);
      if (!entry) {
        const el = document.createElement("div");
        const marker = new lib.Marker({ element: el, anchor: "center", offset: p.offset ?? [0, 0] }).setLngLat([p.lng, p.lat]).addTo(map);
        entry = { marker, el };
        markers.current.set(p.key, entry);
      } else {
        entry.marker.setLngLat([p.lng, p.lat]).setOffset(p.offset ?? [0, 0]);
      }
      entry.el.style.zIndex = String(p.z ?? 1);
      next.set(p.key, entry.el);
    }
    for (const [key, entry] of markers.current) {
      if (!seen.has(key)) {
        entry.marker.remove();
        markers.current.delete(key);
      }
    }
    setEls(next);
  }, [map, pins]);

  return (
    <>
      {/* Mapbox's stylesheet makes its container position:relative, so the map gets its own full-size box inside this one. */}
      <div className="group/map absolute inset-0" data-zoom={zoom}>
        <div ref={box} className="h-full w-full" />
      </div>
      {pins.map((p) => {
        const el = els.get(p.key);
        return el ? createPortal(p.node, el, p.key) : null;
      })}
    </>
  );
}
