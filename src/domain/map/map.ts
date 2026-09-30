/**
 * Vybe Map: launch cities, laying pins out inside a city, and "open now".
 * Pure functions, no framework imports. The cities mirror the `cities` table.
 */

export type Bounds = { north: number; south: number; east: number; west: number };
export type City = { slug: string; name: string; region: string; timezone: string; center: { lat: number; lng: number }; bounds: Bounds };

export const CITIES: readonly City[] = [
  { slug: "charlotte", name: "Charlotte", region: "NC", timezone: "America/New_York", center: { lat: 35.2271, lng: -80.8431 }, bounds: { north: 35.4, south: 35.05, east: -80.65, west: -81.0 } },
  { slug: "atlanta", name: "Atlanta", region: "GA", timezone: "America/New_York", center: { lat: 33.749, lng: -84.388 }, bounds: { north: 33.9, south: 33.64, east: -84.25, west: -84.55 } },
  { slug: "nashville", name: "Nashville", region: "TN", timezone: "America/Chicago", center: { lat: 36.1627, lng: -86.7816 }, bounds: { north: 36.3, south: 36.02, east: -86.6, west: -86.95 } },
  { slug: "houston", name: "Houston", region: "TX", timezone: "America/Chicago", center: { lat: 29.7604, lng: -95.3698 }, bounds: { north: 29.95, south: 29.58, east: -95.15, west: -95.65 } },
  { slug: "phoenix", name: "Phoenix", region: "AZ", timezone: "America/Phoenix", center: { lat: 33.4484, lng: -112.074 }, bounds: { north: 33.65, south: 33.3, east: -111.9, west: -112.3 } },
  { slug: "dc", name: "Washington, DC", region: "DC", timezone: "America/New_York", center: { lat: 38.9072, lng: -77.0369 }, bounds: { north: 38.995, south: 38.8, east: -76.91, west: -77.12 } },
  { slug: "brooklyn", name: "Brooklyn", region: "NY", timezone: "America/New_York", center: { lat: 40.6782, lng: -73.9442 }, bounds: { north: 40.74, south: 40.57, east: -73.85, west: -74.04 } },
  { slug: "miami", name: "Miami", region: "FL", timezone: "America/New_York", center: { lat: 25.7617, lng: -80.1918 }, bounds: { north: 25.87, south: 25.7, east: -80.12, west: -80.32 } },
];

export const DEFAULT_CITY = "charlotte";

export function findCity(slug: string | null | undefined): City {
  return CITIES.find((c) => c.slug === slug) ?? CITIES.find((c) => c.slug === DEFAULT_CITY)!;
}

/**
 * Position inside the city's box as percentages (0–100), with a small inset so pins
 * never sit on the edge. Latitude is corrected for longitude squeeze so shapes aren't stretched.
 */
export function project(lat: number, lng: number, b: Bounds, inset = 6): { x: number; y: number } {
  const clamp = (v: number) => Math.min(100 - inset, Math.max(inset, v));
  const x = ((lng - b.west) / (b.east - b.west)) * 100;
  const y = ((b.north - lat) / (b.north - b.south)) * 100;
  return { x: clamp(inset + (x * (100 - 2 * inset)) / 100), y: clamp(inset + (y * (100 - 2 * inset)) / 100) };
}

export type Hours = { weekday: number; opensAt: string; closesAt: string }; // "HH:MM" or "HH:MM:SS"; weekday 0 = Sunday

const toMinutes = (t: string) => {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** Local weekday (0 = Sunday) and minutes since midnight in a time zone. */
export function localClock(timeZone: string, now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Open right now? Handles closing after midnight (e.g. 17:00–02:00) and 24h (opens == closes). */
export function isOpenAt(hours: readonly Hours[], timeZone: string, now: Date = new Date()): boolean {
  if (!hours.length) return false;
  const { weekday, minutes } = localClock(timeZone, now);
  const yesterday = (weekday + 6) % 7;
  return hours.some((h) => {
    const open = toMinutes(h.opensAt);
    const close = toMinutes(h.closesAt);
    const overnight = close <= open;
    if (h.weekday === weekday) return overnight ? minutes >= open : minutes >= open && minutes < close;
    if (h.weekday === yesterday && overnight) return minutes < close;
    return false;
  });
}
