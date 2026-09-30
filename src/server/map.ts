import "server-only";
import { formatWhen, spotsLeft } from "@/domain/linkups/linkups";
import { findCity, isOpenAt, project, type Hours } from "@/domain/map/map";
import type { MapData, MapFriend, MapLinkup, MapTruck, MapVenue } from "@/domain/map/pins";
import { formatTime } from "@/domain/trucks/trucks";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/server/auth";
import { getFeed } from "@/server/posts";

/** Everything the Vybe Map shows for one city. All reads run under the viewer's RLS. */
export async function getMapData(citySlug: string, viewer: Viewer | null): Promise<MapData> {
  const city = findCity(citySlug);
  const supabase = await createClient();
  const now = new Date();

  // Cities can hold thousands of places: the map shows the ones people care about first (claimed, most posted about).
  const { data: pick } = await supabase.rpc("map_location_ids", { p_city: city.slug, p_limit: 250 });
  const pickIds = ((pick ?? []) as unknown as (string | { map_location_ids: string })[]).map((r) => (typeof r === "string" ? r : r.map_location_ids));
  // Fetched in small batches so each request URL stays short.
  const batches: string[][] = [];
  for (let i = 0; i < pickIds.length; i += 80) batches.push(pickIds.slice(i, i + 80));
  const results = await Promise.all(batches.map((ids) => supabase
    .from("business_locations")
    .select("id, latitude, longitude, timezone, business:businesses ( id, slug, name, branch_name, kind, price_level, logo_url, is_demo, is_claimed ), hours:business_hours ( weekday, opens_at, closes_at )")
    .in("id", ids)));
  const rank = new Map(pickIds.map((id, i) => [id, i]));
  const locs = results.flatMap((r) => r.data ?? []).sort((a, b) => (rank.get((a as { id: string }).id) ?? 0) - (rank.get((b as { id: string }).id) ?? 0));

  type Loc = {
    id: string; latitude: string | number; longitude: string | number; timezone: string;
    business: { id: string; slug: string; name: string; branch_name: string | null; kind: string; price_level: number | null; logo_url: string | null; is_demo: boolean; is_claimed: boolean } | null;
    hours: { weekday: number; opens_at: string; closes_at: string }[];
  };
  const locations = ((locs ?? []) as unknown as Loc[]).filter((l) => l.business);
  const businessIds = [...new Set(locations.map((l) => l.business!.id))];

  const [feed, linkupRows, statusRows, mine, truckRows] = await Promise.all([
    // Photos: the top-ranked places are the ones with posts, so the first 60 is plenty (and keeps the request short).
    getFeed({ kind: "businesses", businessIds: businessIds.slice(0, 60) }),
    supabase
      .from("linkups")
      .select("id, title, occasion, starts_at, ends_at, capacity, is_alcoholic, open_to_new_friends, meet_point, business:businesses ( id, name )")
      .eq("city_slug", city.slug)
      .eq("status", "active")
      .gt("ends_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + 7 * 86_400_000).toISOString())
      .order("starts_at")
      .limit(40),
    viewer
      ? supabase
          .from("vybe_statuses")
          .select("user_id, intent, note, business_id, expires_at, profile:profiles!vybe_statuses_user_id_fkey ( username, display_name )")
          .eq("city_slug", city.slug)
          .gt("expires_at", now.toISOString())
          .neq("user_id", viewer.id)
      : Promise.resolve({ data: [] }),
    viewer ? supabase.from("vybe_statuses").select("intent, note, expires_at").eq("user_id", viewer.id).gt("expires_at", now.toISOString()).maybeSingle() : Promise.resolve({ data: null }),
    // Only trucks here NOW: this minute's window.
    supabase.rpc("food_trucks_in_city", { p_city: city.slug, p_from: now.toISOString(), p_to: new Date(now.getTime() + 60_000).toISOString() }),
  ]);

  // Latest photo per business.
  const photoBy = new Map<string, MapVenue["photo"]>();
  for (const p of feed.posts) {
    const bizId = locations.find((l) => l.business!.slug === p.business?.slug)?.business!.id;
    if (bizId && !photoBy.has(bizId) && p.photos[0]) {
      photoBy.set(bizId, { src: p.photos[0].src, alt: p.photos[0].alt, rating: p.rating, postId: p.id, isAlcoholic: p.isAlcoholic });
    }
  }

  const posByBusiness = new Map<string, { x: number; y: number; lat: number; lng: number }>();
  const venues: MapVenue[] = locations.map((l) => {
    const lat = Number(l.latitude), lng = Number(l.longitude);
    const { x, y } = project(lat, lng, city.bounds);
    const b = l.business!;
    if (!posByBusiness.has(b.id)) posByBusiness.set(b.id, { x, y, lat, lng });
    const hours: Hours[] = l.hours.map((h) => ({ weekday: h.weekday, opensAt: h.opens_at, closesAt: h.closes_at }));
    return {
      id: l.id, businessSlug: b.slug, name: b.branch_name ? `${b.name} · ${b.branch_name}` : b.name, kind: b.kind, priceLevel: b.price_level, logoUrl: b.logo_url, isDemo: b.is_demo, approved: b.is_claimed,
      x, y, lat, lng, openNow: hours.length ? isOpenAt(hours, l.timezone, now) : null, photo: photoBy.get(b.id) ?? null,
    };
  });

  type LinkupRow = { id: string; title: string; occasion: string; starts_at: string; capacity: number; is_alcoholic: boolean; open_to_new_friends: boolean; meet_point: string | null; business: { id: string; name: string } | null };
  const lrows = (linkupRows.data ?? []) as unknown as LinkupRow[];
  const { data: spots } = lrows.length ? await supabase.rpc("linkup_spots", { p_ids: lrows.map((l) => l.id) }) : { data: [] };
  const takenBy = new Map(((spots ?? []) as { linkup_id: string; taken: number }[]).map((s) => [s.linkup_id, s.taken]));
  const linkups: MapLinkup[] = lrows.map((l, i) => {
    const pos = l.business ? posByBusiness.get(l.business.id) : undefined;
    // Link Ups without a listed place sit on a ring around the center so they don't overlap.
    const angle = (i / Math.max(1, lrows.length)) * Math.PI * 2;
    const fallback = {
      x: 50 + Math.cos(angle) * 22, y: 50 + Math.sin(angle) * 18,
      lat: city.center.lat - Math.sin(angle) * 0.02, lng: city.center.lng + Math.cos(angle) * 0.03,
    };
    return {
      id: l.id, title: l.title, occasion: l.occasion, when: formatWhen(new Date(l.starts_at), findCity(city.slug).timezone),
      ...(pos ?? fallback), spotsLeft: spotsLeft(l.capacity, takenBy.get(l.id) ?? 1), capacity: l.capacity,
      isAlcoholic: l.is_alcoholic, openToNewFriends: l.open_to_new_friends, venueName: l.business?.name ?? l.meet_point,
    };
  });

  type StatusRow = { user_id: string; intent: MapFriend["intent"]; note: string | null; business_id: string | null; profile: { username: string; display_name: string | null } | null };
  const friends: MapFriend[] = ((statusRows.data ?? []) as unknown as StatusRow[]).map((s) => {
    const pos = s.business_id ? posByBusiness.get(s.business_id) : undefined;
    return {
      userId: s.user_id, username: s.profile?.username ?? "friend", name: s.profile?.display_name ?? s.profile?.username ?? "Friend",
      intent: s.intent, note: s.note,
      venueName: s.business_id ? (locations.find((l) => l.business!.id === s.business_id)?.business!.name ?? null) : null,
      x: pos?.x ?? null, y: pos?.y ?? null, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
    };
  });

  type TruckRow = {
    business_id: string; slug: string; name: string; cuisine: string | null; location_name: string | null; latitude: string | number | null; longitude: string | number | null;
    start_at: string | null; end_at: string | null; status: string | null; is_live: boolean; live_note: string | null; live_until: string | null;
  };
  const trucks: MapTruck[] = [];
  for (const t of (truckRows.data ?? []) as TruckRow[]) {
    const live = !!t.is_live && !!t.live_until && new Date(t.live_until) > now;
    // A scheduled stop is never "here now": the truck has to mark it open (or delayed / sold out) or check in live.
    const atStop = !!t.start_at && !!t.end_at && !!t.status && ["open", "delayed", "sold_out"].includes(t.status)
      && new Date(t.start_at) <= now && new Date(t.end_at) > now;
    if (!live && !atStop) continue;
    if (t.latitude == null || t.longitude == null) continue;
    const lat = Number(t.latitude), lng = Number(t.longitude);
    const { x, y } = project(lat, lng, city.bounds);
    const until = live ? t.live_until : t.end_at;
    trucks.push({
      id: t.business_id, slug: t.slug, name: t.name, cuisine: t.cuisine, x, y, lat, lng, live,
      until: until ? formatTime(until, city.timezone) : null,
      where: (live ? t.live_note : null) ?? t.location_name ?? t.live_note ?? "Parked nearby",
    });
  }

  const m = mine.data as { intent: MapFriend["intent"]; note: string | null; expires_at: string } | null;
  return {
    city: { slug: city.slug, name: city.name, region: city.region, center: city.center, bounds: city.bounds },
    venues, linkups, friends, trucks,
    myStatus: m ? { intent: m.intent, note: m.note, expiresAt: m.expires_at } : null,
  };
}

/** The city the viewer last picked, else Charlotte. */
export async function getViewerCity(viewer: Viewer | null, override?: string | null): Promise<string> {
  if (override) return findCity(override).slug;
  if (!viewer) return findCity(null).slug;
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("city_slug").eq("user_id", viewer.id).maybeSingle();
  return findCity(data?.city_slug as string | null).slug;
}
