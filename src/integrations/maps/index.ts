import type { Sourced } from "../types";
import { demo } from "../types";

export type LatLng = { lat: number; lng: number };
export type Bounds = { north: number; south: number; east: number; west: number };

export interface MapProvider {
  readonly id: "mock" | "mapbox" | "google";
  /** Whether this provider can render live map tiles in the browser. */
  readonly rendersTiles: boolean;
  geocode(query: string): Promise<Sourced<LatLng | null>>;
  staticPreviewUrl?(center: LatLng, zoom: number): string;
}

/** Development provider: no tiles, fixed coordinates for demo cities. UI shows "Map preview (demo)". */
export const mockMapProvider: MapProvider = {
  id: "mock",
  rendersTiles: false,
  async geocode(query) {
    const known: Record<string, LatLng> = { charlotte: { lat: 35.2271, lng: -80.8431 } };
    return demo("mock-maps", known[query.trim().toLowerCase()] ?? null);
  },
};

export function getMapProvider(id: string | undefined): MapProvider {
  // Mapbox / Google adapters are added in Phase 2 once a key exists.
  if (id && id !== "mock") throw new Error(`Map provider "${id}" is configured but no adapter is installed yet`);
  return mockMapProvider;
}
