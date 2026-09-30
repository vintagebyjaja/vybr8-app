/**
 * Turning OpenStreetMap places into VYBR8 places. Pure functions, no network.
 * Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
 */
import type { Bounds } from "@/domain/map/map";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type ImportRow = {
  ext: string; name: string; kind: string; lat: number; lng: number;
  address: string | null; postal: string | null; website: string | null; phone: string | null;
  brand: string | null; cuisines: string[]; hours: { weekday: number; opens: string; closes: string }[];
};

/** Each city is imported as a TILE_GRID × TILE_GRID grid of small requests. */
export const TILE_GRID = 5;

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/** Split a city's box into an n × n grid, so each request stays small and fast. */
export function tiles(b: Bounds, n = 5): Bounds[] {
  const out: Bounds[] = [];
  const dLat = (b.north - b.south) / n;
  const dLng = (b.east - b.west) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = (x: number) => Math.round(x * 1e6) / 1e6;
      out.push({ south: r(b.south + i * dLat), north: r(b.south + (i + 1) * dLat), west: r(b.west + j * dLng), east: r(b.west + (j + 1) * dLng) });
    }
  }
  return out;
}

/** The Overpass query for food & drink places in one box. */
export function overpassQuery(t: Bounds): string {
  const box = `(${t.south},${t.west},${t.north},${t.east})`;
  return `[out:json][timeout:12];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|biergarten|nightclub|ice_cream|hookah_lounge)$"]["name"]${box};
  nwr["shop"~"^(bakery|pastry)$"]["name"]${box};
  nwr["craft"="brewery"]["name"]${box};
);
out center tags;`;
}

const has = (v: string | undefined, re: RegExp) => !!v && re.test(v);

/** Which VYBR8 kind a place is, or null to leave it out. */
export function kindFor(tags: Record<string, string>): string | null {
  const a = tags.amenity;
  const name = tags.name ?? "";
  const cuisine = (tags.cuisine ?? "").toLowerCase();
  if (tags.craft === "brewery" || tags.microbrewery === "yes") return "brewery";
  switch (a) {
    case "restaurant":
    case "fast_food":
      return "restaurant";
    case "cafe":
      if (/bubble_tea|(^|;)tea($|;)|matcha/.test(cuisine)) return "tea_shop";
      if (/juice|smoothie/.test(cuisine) || /juice|smoothie/i.test(name)) return "juice_bar";
      return "cafe";
    case "ice_cream":
      return "bakery";
    case "hookah_lounge":
      return "hookah_lounge";
    case "nightclub":
      return "nightlife";
    case "bar":
    case "pub":
    case "biergarten":
      if (/hookah/i.test(name)) return "hookah_lounge";
      if (/cigar/i.test(name)) return "cigar_lounge";
      if (/lounge/i.test(name)) return "lounge";
      if (tags.cocktails === "yes" || /cocktail/i.test(name)) return "cocktail_lounge";
      return "bar";
  }
  if (tags.shop === "bakery" || tags.shop === "pastry") return "bakery";
  return null;
}

/** "http://x.com" and "x.com" → "https://x.com". Anything odd → null. */
export function cleanWebsite(v: string | undefined): string | null {
  if (!v) return null;
  let w = v.trim().split(/[;\s]/)[0] ?? "";
  if (!w) return null;
  w = w.replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(w)) w = `https://${w}`;
  try {
    const u = new URL(w);
    return u.hostname.includes(".") && w.length <= 300 ? u.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

const DAYS: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Common OpenStreetMap opening_hours ("Mo-Fr 11:00-22:00; Sa,Su 10:00-23:00", "24/7",
 * "Tu-Sa 11:00-14:00,17:00-02:00"). Anything fancier (holidays, months, "sunset") → [] so we never show wrong hours.
 */
export function parseHours(v: string | undefined): { weekday: number; opens: string; closes: string }[] {
  if (!v) return [];
  const s = v.trim();
  if (s === "24/7") return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "00:00", closes: "23:59" }));
  const out = new Map<string, { weekday: number; opens: string; closes: string }>();
  for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(.+)$/.exec(rule);
    if (!m) return [];
    const days = new Set<number>();
    for (const part of m[1]!.split(",")) {
      const [a, b] = part.split("-") as [string, string | undefined];
      const i = ORDER.indexOf(a);
      const j = b ? ORDER.indexOf(b) : i;
      for (let k = i; ; k = (k + 1) % 7) {
        days.add(DAYS[ORDER[k]!]!);
        if (k === j) break;
      }
    }
    const times = m[2]!.trim();
    if (times === "off" || times === "closed") {
      for (const d of days) for (const key of [...out.keys()]) if (key.startsWith(`${d}|`)) out.delete(key);
      continue;
    }
    for (const range of times.split(",")) {
      const t = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/.exec(range.trim());
      if (!t) return [];
      const oh = Number(t[1]), om = Number(t[2]), ch = Number(t[3]) % 24, cm = Number(t[4]);
      if (oh > 24 || om > 59 || cm > 59) return [];
      const pad = (h: number, mm: number) => `${String(h % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      for (const d of days) {
        const opens = pad(oh, om);
        out.set(`${d}|${opens}`, { weekday: d, opens, closes: pad(ch, cm) });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens));
}

/** One OpenStreetMap element → one VYBR8 import row, or null to skip it. */
export function toImportRow(e: OsmElement): ImportRow | null {
  const t = e.tags ?? {};
  const name = (t.name ?? "").trim();
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!name || lat == null || lng == null) return null;
  if (t["disused:amenity"] || t.disused === "yes" || t.opening_hours === "closed" || t["abandoned:amenity"]) return null;
  const kind = kindFor(t);
  if (!kind) return null;
  const street = t["addr:street"]?.trim();
  const num = t["addr:housenumber"]?.trim();
  return {
    ext: `${e.type}/${e.id}`,
    name: name.slice(0, 120),
    kind,
    lat, lng,
    address: street ? (num ? `${num} ${street}` : street).slice(0, 160) : null,
    postal: t["addr:postcode"]?.trim().slice(0, 10) || null,
    website: cleanWebsite(t.website ?? t["contact:website"]),
    phone: (t.phone ?? t["contact:phone"])?.split(";")[0]?.trim().slice(0, 40) || null,
    brand: t.brand?.trim().slice(0, 120) || null,
    cuisines: (t.cuisine ?? "").split(";").map((c) => c.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    hours: parseHours(t.opening_hours),
  };
}
