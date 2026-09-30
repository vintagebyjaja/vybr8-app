import "server-only";
import { cache } from "react";
import { vybePercent, type CraveFilter, type CraveSort, type CravingCategory } from "@/domain/cravezone/cravezone";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/server/auth";
import { getMyTaste } from "@/server/groups";

/** The craving taxonomy, from the database (ordered for display). */
export const getCravingCategories = cache(async (): Promise<CravingCategory[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("craving_categories")
    .select("slug, name, emoji, tone, indulgent, light, item_keywords, search_terms")
    .eq("active", true)
    .order("sort_order");
  type Row = { slug: string; name: string; emoji: string; tone: string; indulgent: boolean; light: boolean; item_keywords: string[]; search_terms: string[] };
  return ((data ?? []) as Row[]).map((r) => ({
    slug: r.slug, name: r.name, emoji: r.emoji, tone: r.tone, indulgent: r.indulgent, light: r.light,
    itemKeywords: r.item_keywords ?? [], searchTerms: r.search_terms ?? [],
  }));
});

export type CraveItem = {
  kind: "item";
  itemId: string; name: string; description: string | null; priceCents: number | null; category: "food" | "drink";
  business: { id: string; slug: string; name: string; kind: string; logo: string | null; href: string };
  lat: number | null; lng: number | null; meters: number | null; openNow: boolean | null;
  score: number | null; ratings: number; matched: string[]; vybe: number;
  itemSaved: boolean; placeSaved: boolean; photo: string | null;
};
export type CravePlace = {
  kind: "place";
  business: { id: string; slug: string; name: string; kind: string; logo: string | null; href: string };
  cuisines: string[]; priceLevel: number | null; address: string | null;
  lat: number | null; lng: number | null; meters: number | null; openNow: boolean | null;
  rating: number | null; ratings: number; matched: string[]; hasMenu: boolean; placeSaved: boolean;
};

export type CraveQuery = {
  city: string; include: string[]; exclude: string[]; q: string | null;
  lat: number | null; lng: number | null; filters: Set<CraveFilter>; sort: CraveSort;
  maxPriceCents: number | null; wantLight: boolean; wantBig: boolean;
};

const hrefFor = (slug: string, kind: string) => (kind === "food_truck" ? `/food-trucks/${slug}` : `/venue/${slug}`);
const bizName = (name: string, branch: string | null) => (branch ? `${name} · ${branch}` : name);
const mentions = (hay: string, words: string[]) => {
  const h = hay.toLowerCase();
  return words.filter((w) => w.trim().length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "u").test(h)).length;
};

/** CraveZone results: items first, then places that can hit the craving when their menu isn't on VYBR8 yet. */
export async function searchCravings(viewer: Viewer | null, q: CraveQuery): Promise<{ items: CraveItem[]; places: CravePlace[] }> {
  const supabase = await createClient();
  const f = q.filters;
  const maxPrice = q.maxPriceCents ?? (f.has("u10") ? 1000 : f.has("u20") ? 2000 : null);
  const kinds = f.has("trucks") ? ["food_truck"] : f.has("dinein") ? ["restaurant", "bar", "cocktail_lounge", "lounge", "cafe", "bakery", "brewery", "tea_shop", "juice_bar", "hookah_lounge", "cigar_lounge", "nightlife"] : null;
  const include = q.include.length ? q.include : [];
  const wantLight = q.wantLight || f.has("healthyish");
  const wantBig = q.wantBig || f.has("bigback");

  const [itemsRes, placesRes, taste] = await Promise.all([
    supabase.rpc("crave_items", {
      p_city: q.city, p_cravings: include, p_exclude: q.exclude, p_q: q.q, p_lat: q.lat, p_lng: q.lng,
      p_open_now: f.has("open"), p_max_price_cents: maxPrice, p_kinds: kinds, p_badge: f.has("black_owned") ? "black_owned" : null,
      p_local_only: f.has("local"), p_saved_only: f.has("saved") && !!viewer, p_limit: 80,
    }),
    f.has("saved") ? Promise.resolve({ data: [] }) : supabase.rpc("crave_places", {
      p_city: q.city, p_cravings: include, p_q: q.q, p_lat: q.lat, p_lng: q.lng, p_open_now: f.has("open"), p_kinds: kinds,
      p_badge: f.has("black_owned") ? "black_owned" : null, p_local_only: f.has("local"),
      p_max_price_level: maxPrice == null ? null : maxPrice <= 1000 ? 1 : 2, p_limit: 40,
    }),
    viewer ? getMyTaste(viewer) : Promise.resolve(null),
  ]);

  type ItemRow = {
    item_id: string; item_name: string; description: string | null; price_cents: number | null; category: "food" | "drink";
    business_id: string; slug: string; business_name: string; branch_name: string | null; kind: string; logo_url: string | null;
    lat: number | null; lng: number | null; meters: number | null; open_now: boolean | null; avg_score: number | null; rating_count: number;
    matched: string[]; match_weight: number; item_saved: boolean; place_saved: boolean; indulgent: boolean; light: boolean;
  };
  const allergies = taste?.allergies ?? [];
  const dislikes = taste?.dislikes ?? [];
  const likes = [...(taste?.likes ?? []), ...(taste?.dietary ?? [])];

  let items: CraveItem[] = ((itemsRes.data ?? []) as ItemRow[])
    // Allergies are a hard stop, whatever the mode.
    .filter((r) => !allergies.length || mentions(`${r.item_name} ${r.description ?? ""}`, allergies) === 0)
    .map((r) => {
      const hay = `${r.item_name} ${r.description ?? ""}`;
      return {
        kind: "item" as const,
        itemId: r.item_id, name: r.item_name.replace(/\s*\(demo\)\s*$/i, ""), description: r.description, priceCents: r.price_cents, category: r.category,
        business: { id: r.business_id, slug: r.slug, name: bizName(r.business_name, r.branch_name), kind: r.kind, logo: r.logo_url, href: hrefFor(r.slug, r.kind) },
        lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng), meters: r.meters, openNow: r.open_now,
        score: r.avg_score == null ? null : Number(r.avg_score), ratings: r.rating_count, matched: r.matched,
        vybe: vybePercent({
          wanted: include.length, matchedCount: r.matched.length, matchWeight: Number(r.match_weight),
          avgScore: r.avg_score == null ? null : Number(r.avg_score), ratingCount: r.rating_count, meters: r.meters,
          tasteHits: Math.min(2, mentions(hay, likes)), tasteMisses: Math.min(2, mentions(hay, dislikes)),
          light: r.light, indulgent: r.indulgent, wantLight, wantBig,
        }),
        itemSaved: r.item_saved, placeSaved: r.place_saved, photo: null,
      };
    });
  if (wantLight) items = items.filter((i) => i.vybe >= 20);

  const sorters: Record<CraveSort, (a: CraveItem, b: CraveItem) => number> = {
    match: (a, b) => b.vybe - a.vybe,
    top: (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.ratings - a.ratings || b.vybe - a.vybe,
    near: (a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity),
    price: (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
  };
  items.sort(sorters[q.sort]);
  items = items.slice(0, 40);
  await attachPhotos(items);

  type PlaceRow = {
    business_id: string; slug: string; name: string; branch_name: string | null; kind: string; cuisines: string[]; price_level: number | null; logo_url: string | null;
    address: string | null; lat: number | null; lng: number | null; meters: number | null; open_now: boolean | null; rating: number | null; ratings: number;
    matched: string[]; has_menu: boolean; place_saved: boolean;
  };
  const withItems = new Set(items.map((i) => i.business.id));
  const placeSort: Record<CraveSort, (a: CravePlace, b: CravePlace) => number> = {
    match: (a, b) => b.matched.length - a.matched.length || (b.rating ?? -1) - (a.rating ?? -1) || (a.meters ?? Infinity) - (b.meters ?? Infinity),
    top: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (a.meters ?? Infinity) - (b.meters ?? Infinity),
    near: (a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity),
    price: (a, b) => (a.priceLevel ?? 9) - (b.priceLevel ?? 9) || (a.meters ?? Infinity) - (b.meters ?? Infinity),
  };
  const places: CravePlace[] = ((placesRes.data ?? []) as PlaceRow[])
    .filter((r) => !withItems.has(r.business_id))
    .map((r) => ({
      kind: "place" as const,
      business: { id: r.business_id, slug: r.slug, name: bizName(r.name, r.branch_name), kind: r.kind, logo: r.logo_url, href: hrefFor(r.slug, r.kind) },
      cuisines: r.cuisines ?? [], priceLevel: r.price_level, address: r.address,
      lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng), meters: r.meters, openNow: r.open_now,
      rating: r.rating == null ? null : Number(r.rating), ratings: r.ratings, matched: r.matched, hasMenu: r.has_menu, placeSaved: r.place_saved,
    }))
    .sort(placeSort[q.sort])
    .slice(0, 24);

  return { items, places };
}

/** Food photography first: the newest public post photo of the same dish at the same place. */
async function attachPhotos(items: CraveItem[]) {
  if (!items.length) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("business_id, item_name, created_at, media:post_media ( storage_path, position )")
    .in("business_id", [...new Set(items.map((i) => i.business.id))])
    .not("item_name", "is", null)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  type Row = { business_id: string; item_name: string; media: { storage_path: string; position: number }[] };
  const key = (biz: string, name: string) => `${biz}|${name.toLowerCase().replace(/\s*\(demo\)\s*$/, "").trim()}`;
  const pathBy = new Map<string, string>();
  for (const r of (data ?? []) as Row[]) {
    const first = [...(r.media ?? [])].sort((a, b) => a.position - b.position)[0];
    if (first && !pathBy.has(key(r.business_id, r.item_name))) pathBy.set(key(r.business_id, r.item_name), first.storage_path);
  }
  const wanted = items.map((i) => pathBy.get(key(i.business.id, i.name))).filter((p): p is string => !!p);
  const toSign = wanted.filter((p) => !p.startsWith("demo/"));
  const signed = toSign.length ? (await supabase.storage.from("post-media").createSignedUrls(toSign, 60 * 60)).data ?? [] : [];
  const urlBy = new Map<string, string>(signed.filter((s) => s.path).map((s) => [s.path as string, s.signedUrl as string]));
  for (const i of items) {
    const p = pathBy.get(key(i.business.id, i.name));
    if (p) i.photo = p.startsWith("demo/") ? `/${p}` : ((urlBy.get(p) as string | undefined) ?? null);
  }
}
