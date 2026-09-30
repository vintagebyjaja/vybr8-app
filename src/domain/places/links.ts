/**
 * Place links: where to see the menu, order, book a table, or follow the place.
 * Pure helpers (no network). VYBR8 never scrapes these services; it only links out.
 */

export type LinkKind =
  | "website" | "menu" | "order" | "instagram" | "facebook" | "tiktok"
  | "doordash" | "ubereats" | "grubhub" | "postmates" | "opentable" | "resy" | "tock";

export type LinkGroup = "menu" | "order" | "reserve" | "follow";

export const LINK_INFO: Record<LinkKind, { label: string; short: string; group: LinkGroup; host: RegExp | null; community: boolean }> = {
  website:   { label: "Website",   short: "Site",   group: "menu",    host: null, community: false },
  menu:      { label: "Menu",      short: "Menu",   group: "menu",    host: null, community: false },
  order:     { label: "Order online", short: "Order", group: "order", host: null, community: false },
  doordash:  { label: "DoorDash",  short: "DoorDash",  group: "order", host: /^(www\.|order\.)?doordash\.com$/i, community: true },
  ubereats:  { label: "Uber Eats", short: "Uber Eats", group: "order", host: /^(www\.)?ubereats\.com$/i, community: true },
  grubhub:   { label: "Grubhub",   short: "Grubhub",   group: "order", host: /^(www\.)?grubhub\.com$/i, community: true },
  postmates: { label: "Postmates", short: "Postmates", group: "order", host: /^(www\.)?postmates\.com$/i, community: true },
  opentable: { label: "OpenTable", short: "OpenTable", group: "reserve", host: /^(www\.)?opentable\.com$/i, community: true },
  resy:      { label: "Resy",      short: "Resy",      group: "reserve", host: /^(www\.)?resy\.com$/i, community: true },
  tock:      { label: "Tock",      short: "Tock",      group: "reserve", host: /^(www\.)?exploretock\.com$/i, community: true },
  instagram: { label: "Instagram", short: "IG",        group: "follow", host: /^(www\.)?instagram\.com$/i, community: true },
  facebook:  { label: "Facebook",  short: "FB",        group: "follow", host: /^((www|m)\.)?facebook\.com$/i, community: true },
  tiktok:    { label: "TikTok",    short: "TikTok",    group: "follow", host: /^(www\.)?tiktok\.com$/i, community: true },
};
export const LINK_KINDS = Object.keys(LINK_INFO) as LinkKind[];
export const COMMUNITY_KINDS = LINK_KINDS.filter((k) => LINK_INFO[k].community);
export const isLinkKind = (k: unknown): k is LinkKind => typeof k === "string" && k in LINK_INFO;

const toHttps = (raw: string): string | null => {
  let w = raw.trim().split(/[;\s]/)[0] ?? "";
  if (!w) return null;
  w = w.replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(w)) w = `https://${w}`;
  try {
    const u = new URL(w);
    return u.hostname.includes(".") && w.length <= 400 ? u.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
};

/** Which provider a URL belongs to (DoorDash, OpenTable…), or null. */
export function providerFor(url: string): LinkKind | null {
  try {
    const host = new URL(url).hostname;
    for (const k of LINK_KINDS) if (LINK_INFO[k].host?.test(host)) return k;
  } catch { /* not a URL */ }
  return null;
}

/** "@smokepit", "smokepit" or a full URL → https://www.instagram.com/smokepit */
export function instagramUrl(v: string): string | null {
  const s = v.trim();
  if (/instagram\.com/i.test(s)) {
    const u = toHttps(s);
    const m = u && /instagram\.com\/([A-Za-z0-9_.]{1,30})/i.exec(u);
    return m ? `https://www.instagram.com/${m[1]}` : null;
  }
  const h = s.replace(/^@/, "");
  return /^[A-Za-z0-9_.]{1,30}$/.test(h) ? `https://www.instagram.com/${h}` : null;
}

/** OpenStreetMap tags → links (menu, socials, and any delivery/reservation URLs someone tagged). */
export function osmLinks(tags: Record<string, string>): Partial<Record<LinkKind, string>> {
  const out: Partial<Record<LinkKind, string>> = {};
  const ig = tags["contact:instagram"] ?? tags.instagram;
  if (ig) { const u = instagramUrl(ig); if (u) out.instagram = u; }
  const fb = tags["contact:facebook"] ?? tags.facebook;
  if (fb) {
    const u = /facebook\.com/i.test(fb) ? toHttps(fb) : /^[A-Za-z0-9.\-]{2,80}$/.test(fb.trim()) ? `https://www.facebook.com/${fb.trim()}` : null;
    if (u && providerFor(u) === "facebook") out.facebook = u;
  }
  const tt = tags["contact:tiktok"] ?? tags.tiktok;
  if (tt) {
    const h = tt.trim().replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
    if (/^[A-Za-z0-9_.]{2,30}$/.test(h)) out.tiktok = `https://www.tiktok.com/@${h}`;
  }
  const menu = tags["website:menu"] ?? tags["menu:url"] ?? tags["contact:menu"];
  if (menu) { const u = toHttps(menu); if (u) out.menu = u; }
  // Any tag holding a provider link (website:orders, order:url, reservation:url, contact:doordash…).
  for (const [k, v] of Object.entries(tags)) {
    if (!/(^|:)(website|url|order|orders|reservation|reservations|delivery|takeaway|doordash|ubereats|uber_eats|grubhub|opentable|resy)(:|$)/.test(k)) continue;
    const u = toHttps(v);
    const p = u ? providerFor(u) : null;
    if (u && p && !out[p] && LINK_INFO[p].group !== "follow") out[p] = u;
  }
  return out;
}

/**
 * Honest fallbacks when a place has no link on VYBR8 yet: searches on each service for this place.
 * Labeled "Search …" in the UI: they never claim the place is on that service.
 */
export function searchLinks(name: string, cityName: string, kind: string): { key: string; label: string; url: string; group: LinkGroup }[] {
  const q = `${name} ${cityName}`.trim();
  const e = encodeURIComponent;
  const links = [
    { key: "menu", label: "Find the menu", url: `https://www.google.com/search?q=${e(`${q} menu`)}`, group: "menu" as const },
    { key: "doordash", label: "DoorDash", url: `https://www.doordash.com/search/store/${e(name)}/`, group: "order" as const },
    { key: "ubereats", label: "Uber Eats", url: `https://www.ubereats.com/search?q=${e(name)}`, group: "order" as const },
    { key: "grubhub", label: "Grubhub", url: `https://www.grubhub.com/search?queryText=${e(name)}`, group: "order" as const },
    { key: "opentable", label: "OpenTable", url: `https://www.opentable.com/s?term=${e(q)}`, group: "reserve" as const },
    { key: "instagram", label: "Instagram", url: `https://www.google.com/search?q=${e(`${q} instagram`)}`, group: "follow" as const },
  ];
  // Reservations only make sense for sit-down spots.
  const seated = ["restaurant", "bar", "cocktail_lounge", "lounge", "brewery", "nightlife", "hookah_lounge", "cigar_lounge"].includes(kind);
  return links.filter((l) => l.group !== "reserve" || seated);
}
