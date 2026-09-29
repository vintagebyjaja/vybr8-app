import "server-only";
import { findCity } from "@/domain/map/map";
import { stopState, windowFor, type LocationSource, type StopState, type StopStatus, type TruckFilter } from "@/domain/trucks/trucks";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/server/log";

export type TruckStop = {
  id: string;
  locationName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  citySlug: string | null;
  timezone: string;
  startAt: string;
  endAt: string;
  eventName: string | null;
  status: StopStatus;
  source: LocationSource;
  verifiedAt: string | null;
  updatedAt: string;
  state: StopState;
};

export type TruckLive = { lat: number; lng: number; citySlug: string | null; note: string | null; startedAt: string; expiresAt: string };

export type TruckCard = {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  photoUrl: string | null;
  timezone: string;
  stop: TruckStop | null;
  live: { note: string | null; until: string } | null;
  hereNow: boolean;
  lat: number | null;
  lng: number | null;
  topItem: { name: string; score: number; count: number } | null;
  stats: { overall: number | null; serviceVybe: number | null; value: number | null; count: number } | null;
};

const n = (v: unknown) => (v == null ? null : Number(v));

type RpcRow = {
  business_id: string; slug: string; name: string; cuisine: string | null; stop_id: string | null; location_name: string | null; address: string | null;
  event_name: string | null; latitude: string | number | null; longitude: string | number | null; start_at: string | null; end_at: string | null;
  status: StopStatus | null; is_live: boolean; live_note: string | null; live_until: string | null;
};

/** Top-rated item and place scores for a set of trucks. */
async function scoresFor(ids: string[]) {
  const supabase = await createClient();
  const [{ data: items }, { data: stats }, { data: profiles }] = await Promise.all([
    supabase.from("menu_item_stats").select("menu_item_id, business_id, avg_score, rating_count").in("business_id", ids).gt("rating_count", 0).order("avg_score", { ascending: false }),
    supabase.from("place_stats").select("business_id, overall, service_vybe, value, rating_count").in("business_id", ids),
    supabase.from("food_truck_profiles").select("business_id, truck_photo_url").in("business_id", ids),
  ]);
  type ItemStat = { menu_item_id: string; business_id: string; avg_score: string | number | null; rating_count: number };
  const top = new Map<string, ItemStat>();
  for (const s of (items ?? []) as ItemStat[]) if (!top.has(s.business_id) && s.avg_score != null) top.set(s.business_id, s);
  const itemIds = [...top.values()].map((s) => s.menu_item_id);
  const { data: names } = itemIds.length ? await supabase.from("menu_items").select("id, name").in("id", itemIds) : { data: [] };
  const nameBy = new Map(((names ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  type PlaceRow = { business_id: string; overall: unknown; service_vybe: unknown; value: unknown; rating_count: number };
  const statBy = new Map(((stats ?? []) as PlaceRow[]).map((s) => [s.business_id, s]));
  const photoBy = new Map(((profiles ?? []) as { business_id: string; truck_photo_url: string | null }[]).map((p) => [p.business_id, p.truck_photo_url]));
  return {
    topItem(id: string): TruckCard["topItem"] {
      const t = top.get(id);
      const name = t ? nameBy.get(t.menu_item_id) : undefined;
      return t && name ? { name, score: Number(t.avg_score), count: t.rating_count } : null;
    },
    stats(id: string): TruckCard["stats"] {
      const s = statBy.get(id);
      return s && s.rating_count > 0 ? { overall: n(s.overall), serviceVybe: n(s.service_vybe), value: n(s.value), count: s.rating_count } : null;
    },
    photo: (id: string) => photoBy.get(id) ?? null,
  };
}

/** Trucks in a city for a filter window. "Here now" only when the truck confirmed it (open stop in its window, or WE'RE HERE). */
export async function listTrucks(citySlug: string, filter: TruckFilter): Promise<TruckCard[]> {
  const city = findCity(citySlug);
  const now = new Date();
  const { from, to } = windowFor(filter, now, city.timezone);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("food_trucks_in_city", { p_city: city.slug, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) log.warn("trucks.list_failed", { city: city.slug, code: error.code });
  const rows = (data ?? []) as RpcRow[];
  if (!rows.length) return [];

  const stopIds = rows.map((r) => r.stop_id).filter((v): v is string => !!v);
  const [{ data: meta }, scores] = await Promise.all([
    stopIds.length ? supabase.from("food_truck_schedules").select("id, source, verified_at, updated_at, city_slug").in("id", stopIds) : Promise.resolve({ data: [] }),
    scoresFor([...new Set(rows.map((r) => r.business_id))]),
  ]);
  type Meta = { id: string; source: LocationSource; verified_at: string | null; updated_at: string; city_slug: string | null };
  const metaBy = new Map(((meta ?? []) as Meta[]).map((m) => [m.id, m]));

  const cards = rows.map((r): TruckCard => {
    const m = r.stop_id ? metaBy.get(r.stop_id) : undefined;
    const stop: TruckStop | null =
      r.stop_id && r.start_at && r.end_at && r.status
        ? {
            id: r.stop_id, locationName: r.location_name ?? "", address: r.address, lat: n(r.latitude), lng: n(r.longitude),
            citySlug: m?.city_slug ?? city.slug, timezone: city.timezone, startAt: r.start_at, endAt: r.end_at, eventName: r.event_name,
            status: r.status, source: m?.source ?? "operator", verifiedAt: m?.verified_at ?? null, updatedAt: m?.updated_at ?? r.start_at,
            state: stopState({ startAt: r.start_at, endAt: r.end_at, status: r.status }, now, city.timezone),
          }
        : null;
    const live = r.live_until && new Date(r.live_until) > now ? { note: r.live_note, until: r.live_until } : null;
    return {
      id: r.business_id, slug: r.slug, name: r.name, cuisine: r.cuisine, photoUrl: scores.photo(r.business_id), timezone: city.timezone,
      stop, live, hereNow: !!live || stop?.state === "here_now", lat: n(r.latitude), lng: n(r.longitude),
      topItem: scores.topItem(r.business_id), stats: scores.stats(r.business_id),
    };
  });

  const visible = cards.filter((c) => {
    if (filter === "open_now") return c.hereNow;
    if (filter === "all") return true;
    return c.hereNow || (!!c.stop && c.stop.state !== "ended" && c.stop.state !== "cancelled");
  });
  return visible.sort((a, b) => {
    if (a.hereNow !== b.hereNow) return a.hereNow ? -1 : 1;
    const as = a.stop ? new Date(a.stop.startAt).getTime() : Infinity, bs = b.stop ? new Date(b.stop.startAt).getTime() : Infinity;
    return as - bs || a.name.localeCompare(b.name);
  });
}

export type Social = { label: string; url: string };

export type TruckDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  website: string | null;
  isDemo: boolean;
  cuisine: string | null;
  photoUrl: string | null;
  orderingUrl: string | null;
  socials: Social[];
  cateringAvailable: boolean;
  homeCitySlug: string | null;
  timezone: string;
  stops: TruckStop[];
  live: TruckLive | null;
  followers: number;
  following: boolean;
  notify: boolean;
  canEdit: boolean;
};

function toSocials(v: unknown): Social[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s): Social | null => {
      if (typeof s === "string" && s.startsWith("https://")) return { label: labelForUrl(s), url: s };
      if (s && typeof s === "object" && typeof (s as Social).url === "string" && (s as Social).url.startsWith("https://")) {
        const o = s as Partial<Social>;
        return { label: o.label || labelForUrl(o.url!), url: o.url! };
      }
      return null;
    })
    .filter((s): s is Social => !!s);
}

/** "Instagram" for https://instagram.com/..., else the host name. */
export function labelForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const known: Record<string, string> = { "instagram.com": "Instagram", "tiktok.com": "TikTok", "facebook.com": "Facebook", "x.com": "X", "twitter.com": "X", "youtube.com": "YouTube", "threads.net": "Threads" };
    return known[host] ?? host;
  } catch {
    return "Link";
  }
}

/** A truck's profile: schedule (last 12 hours through the next 14 days), live pin, followers and whether I can edit it. */
export async function getTruck(slug: string, viewerId: string | null): Promise<TruckDetail | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, name, kind, description, website, is_demo")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!biz || biz.kind !== "food_truck") return null;
  const id = biz.id as string;
  const now = new Date();

  const [{ data: profile }, { data: stops }, { data: live }, { data: followers }, follow, member] = await Promise.all([
    supabase.from("food_truck_profiles").select("cuisine, truck_photo_url, ordering_url, socials, catering_available, home_city_slug").eq("business_id", id).maybeSingle(),
    supabase
      .from("food_truck_schedules")
      .select("id, location_name, address, latitude, longitude, city_slug, start_at, end_at, event_name, status, source, verified_at, updated_at")
      .eq("business_id", id)
      .gt("end_at", new Date(now.getTime() - 12 * 3_600_000).toISOString())
      .lt("start_at", new Date(now.getTime() + 14 * 86_400_000).toISOString())
      .order("start_at")
      .limit(80),
    supabase.from("food_truck_live_status").select("latitude, longitude, city_slug, note, started_at, expires_at").eq("business_id", id).gt("expires_at", now.toISOString()).maybeSingle(),
    supabase.rpc("food_truck_follower_count", { p_business: id }),
    viewerId ? supabase.from("food_truck_follows").select("notify").eq("business_id", id).eq("user_id", viewerId).maybeSingle() : Promise.resolve({ data: null }),
    viewerId ? supabase.from("business_members").select("role").eq("business_id", id).eq("user_id", viewerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const home = findCity((profile?.home_city_slug as string | null) ?? null);
  type StopRow = {
    id: string; location_name: string; address: string | null; latitude: unknown; longitude: unknown; city_slug: string | null; start_at: string; end_at: string;
    event_name: string | null; status: StopStatus; source: LocationSource; verified_at: string | null; updated_at: string;
  };
  const role = (member.data as { role?: string } | null)?.role;
  const f = follow.data as { notify: boolean } | null;
  const l = live as { latitude: unknown; longitude: unknown; city_slug: string | null; note: string | null; started_at: string; expires_at: string } | null;

  return {
    id, slug: biz.slug as string, name: biz.name as string, description: (biz.description as string | null) ?? null, website: (biz.website as string | null) ?? null,
    isDemo: !!biz.is_demo,
    cuisine: (profile?.cuisine as string | null) ?? null,
    photoUrl: (profile?.truck_photo_url as string | null) ?? null,
    orderingUrl: (profile?.ordering_url as string | null) ?? null,
    socials: toSocials(profile?.socials),
    cateringAvailable: !!profile?.catering_available,
    homeCitySlug: (profile?.home_city_slug as string | null) ?? null,
    timezone: home.timezone,
    stops: ((stops ?? []) as StopRow[]).map((s) => {
      const tz = s.city_slug ? findCity(s.city_slug).timezone : home.timezone;
      return {
        id: s.id, locationName: s.location_name, address: s.address, lat: n(s.latitude), lng: n(s.longitude), citySlug: s.city_slug, timezone: tz,
        startAt: s.start_at, endAt: s.end_at, eventName: s.event_name, status: s.status, source: s.source, verifiedAt: s.verified_at, updatedAt: s.updated_at,
        state: stopState({ startAt: s.start_at, endAt: s.end_at, status: s.status }, now, tz),
      };
    }),
    live: l ? { lat: Number(l.latitude), lng: Number(l.longitude), citySlug: l.city_slug, note: l.note, startedAt: l.started_at, expiresAt: l.expires_at } : null,
    followers: typeof followers === "number" ? followers : Number(followers ?? 0),
    following: !!f,
    notify: f?.notify ?? false,
    canEdit: role === "owner" || role === "manager",
  };
}

export type MyTruck = { id: string; slug: string; name: string; role: "owner" | "manager"; isDemo: boolean };

/** Food trucks the viewer runs (owner or manager), for the operator dashboard. */
export async function getMyTrucks(viewerId: string): Promise<MyTruck[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_members")
    .select("role, business:businesses ( id, slug, name, kind, is_demo, deleted_at )")
    .eq("user_id", viewerId)
    .in("role", ["owner", "manager"]);
  type Row = { role: "owner" | "manager"; business: { id: string; slug: string; name: string; kind: string; is_demo: boolean; deleted_at: string | null } | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.business && r.business.kind === "food_truck" && !r.business.deleted_at)
    .map((r) => ({ id: r.business!.id, slug: r.business!.slug, name: r.business!.name, role: r.role, isDemo: r.business!.is_demo }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
