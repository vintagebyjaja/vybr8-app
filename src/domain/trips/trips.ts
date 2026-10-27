/**
 * Trips to a place or a Link Up: Groove Guide links, distance and leave-by times.
 * Pure helpers (no network).
 */

export type Destination = { name: string; lat: number | null; lng: number | null; address: string | null };
export type TravelMode = "drive" | "walk";

const GROOVE_GUIDE = "https://grooveville.org/guide/navigate";

/** Opens Groove Guide already routed to the place (coordinates when known, otherwise the address text). */
export function grooveGuideUrl(d: Destination): string | null {
  const u = new URLSearchParams();
  if (d.lat != null && d.lng != null && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
    u.set("to", `${d.lat.toFixed(6)},${d.lng.toFixed(6)}`);
    u.set("name", d.name.slice(0, 80));
    if (d.address) u.set("addr", d.address.slice(0, 160));
  } else if (d.address || d.name) {
    u.set("q", (d.address ? `${d.name}, ${d.address}` : d.name).slice(0, 200));
    u.set("name", d.name.slice(0, 80));
  } else {
    return null;
  }
  return `${GROOVE_GUIDE}?${u}`;
}

/** Straight-line distance in miles (used when a road route isn't available). */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const formatMiles = (mi: number): string => (mi < 0.1 ? "right here" : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`);

export function formatMinutes(min: number): string {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

/** Parking and walking in: a few minutes on top of drive time (none for walking). */
export const BUFFER_MIN: Record<TravelMode, number> = { drive: 5, walk: 0 };

/** When to leave to arrive on time; null if that time has already passed by more than an hour (Link Up is underway). */
export function leaveBy(startsAt: Date, travelMin: number, mode: TravelMode, now = new Date()): { at: Date; late: boolean; minutesUntil: number } | null {
  const at = new Date(startsAt.getTime() - (travelMin + BUFFER_MIN[mode]) * 60_000);
  const minutesUntil = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutesUntil < -60) return null;
  return { at, late: minutesUntil < 0, minutesUntil };
}

/** "Leave by 7:15 PM" / "Leave now" / "Running 10 min late". */
export function leaveByLabel(l: { at: Date; late: boolean; minutesUntil: number }, timeZone: string): string {
  if (l.late) return `Running ${formatMinutes(-l.minutesUntil)} late`;
  if (l.minutesUntil <= 2) return "Leave now";
  const t = l.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return l.minutesUntil < 60 ? `Leave by ${t} (in ${formatMinutes(l.minutesUntil)})` : `Leave by ${t}`;
}

/** ETAs shared in a Link Up are only shown while fresh. */
export const ETA_STALE_MIN = 15;
