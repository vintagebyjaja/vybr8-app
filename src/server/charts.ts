import "server-only";
import { cache } from "react";
import { rankSubjects, type RankedSubject } from "@/domain/ranking/ranking";
import { dishTypeTitle, CHART_SIZE, type Chart, type ChartEntry, type ChartKind, type RankBadge } from "@/domain/charts/charts";

export type { Chart, ChartEntry, RankBadge };
import { createClient } from "@/lib/supabase/server";

/**
 * VYBR8 Charts. Ranked per city on confidence (Bayesian prior + recency), never raw averages, and never by payment.
 * Launch thresholds are lower than the long-term defaults so early cities get charts; raise them as data grows.
 */
export const CHART_THRESHOLDS = { minRatings: 3, minEffectiveRatings: 2 } as const;
export const MIN_CHEF_REVIEWS_FOR_CHARTS = 5;


type RatingRow = { score: number | string; created_at: string };
type Biz = {
  id: string; slug: string; name: string; branch_name: string | null; kind: string;
  locations: { city_slug: string | null }[] | null;
  truck: { home_city_slug: string | null } | { home_city_slug: string | null }[] | null;
};

const bizTitle = (b: Biz) => (b.branch_name ? `${b.name} · ${b.branch_name}` : b.name);
const bizHref = (b: Pick<Biz, "slug" | "kind">) => (b.kind === "food_truck" ? `/food-trucks/${b.slug}` : `/venue/${b.slug}`);
function inCity(b: Biz, city: string): boolean {
  if ((b.locations ?? []).some((l) => l.city_slug === city)) return true;
  const t = Array.isArray(b.truck) ? b.truck[0] : b.truck;
  return t?.home_city_slug === city;
}
const withCity = (path: string, city: string) => `${path}?city=${encodeURIComponent(city)}`;

function rankGroups<T>(groups: Map<string, { meta: T; ratings: RatingRow[] }>, thresholds: { minRatings: number; minEffectiveRatings: number } = CHART_THRESHOLDS): { ranked: RankedSubject[]; meta: Map<string, T> } {
  const now = new Date();
  const subjects = [...groups.entries()].map(([subjectId, g]) => ({ subjectId, ratings: g.ratings.map((r) => ({ score: Number(r.score), ratedAt: new Date(r.created_at) })) }));
  const { ranked } = rankSubjects(subjects, now, thresholds);
  return { ranked, meta: new Map([...groups.entries()].map(([k, g]) => [k, g.meta])) };
}

// ── Raw ratings, loaded once per request ───────────────────────────────
const BIZ = "id, slug, name, branch_name, kind, locations:business_locations ( city_slug ), truck:food_truck_profiles ( home_city_slug )";

type ItemRow = RatingRow & { item: { id: string; name: string; dish_type: string | null; category: "food" | "drink"; business: Biz } };
const itemRows = cache(async (): Promise<ItemRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("item_ratings")
    .select(`score, created_at, item:menu_items!inner ( id, name, dish_type, category, business:businesses!inner ( ${BIZ} ) )`)
    .eq("status", "published")
    .limit(20000);
  return (data ?? []) as unknown as ItemRow[];
});

type PlaceDim = "overall" | "service_vybe" | "value" | "aesthetic";
type PlaceRow = { overall: number; service_vybe: number | null; value: number | null; aesthetic: number | null; created_at: string; business: Biz };
const placeRows = cache(async (): Promise<PlaceRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("place_ratings")
    .select(`overall, service_vybe, value, aesthetic, created_at, business:businesses!inner ( ${BIZ} )`)
    .eq("status", "published")
    .limit(20000);
  return (data ?? []) as unknown as PlaceRow[];
});

type ChefRow = { food_quality: number; created_at: string; service: string; chef: { id: string; slug: string; professional_name: string; verification: string; city_slug: string | null } };
const chefRows = cache(async (): Promise<ChefRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chef_reviews")
    .select("food_quality, created_at, service, chef:chef_profiles!inner ( id, slug, professional_name, verification, city_slug )")
    .eq("status", "published")
    .limit(20000);
  return ((data ?? []) as unknown as ChefRow[]).filter((r) => r.chef.verification === "verified");
});

// ── Dishes and drinks ──────────────────────────────────────────────────
/** One ranked list: a single dish type ("wings"), or every plate / every pour when dishType is null. */
async function rankItems(category: "food" | "drink", city: string, dishType: string | null, trucksOnly = false) {
  const groups = new Map<string, { meta: ItemRow["item"]; ratings: RatingRow[] }>();
  for (const r of await itemRows()) {
    const it = r.item;
    if (it.category !== category || !it.dish_type) continue;
    if (dishType && it.dish_type !== dishType) continue;
    if (trucksOnly && it.business.kind !== "food_truck") continue;
    if (!inCity(it.business, city)) continue;
    const g = groups.get(it.id) ?? { meta: it, ratings: [] };
    g.ratings.push(r);
    groups.set(it.id, g);
  }
  return rankGroups(groups);
}

function itemEntries(ranked: RankedSubject[], meta: Map<string, ItemRow["item"]>, limit: number): ChartEntry[] {
  return ranked.slice(0, limit).map((s) => {
    const m = meta.get(s.subjectId)!;
    return { rank: s.rank, id: m.id, name: m.name, sub: bizTitle(m.business), href: bizHref(m.business), score: s.weightedMean, count: s.ratingCount };
  });
}

/** Top 5 per dish type (Wings, Tacos, Margaritas…) in a city, each linking to its full Top 25. */
export async function itemCharts(category: "food" | "drink", city: string, trucksOnly = false): Promise<Chart[]> {
  const types = new Set((await itemRows()).filter((r) => r.item.category === category && r.item.dish_type && inCity(r.item.business, city)).map((r) => r.item.dish_type!));
  const kind: ChartKind = trucksOnly ? "trucks" : category === "food" ? "plates" : "pours";
  const charts: Chart[] = [];
  for (const type of types) {
    const { ranked, meta } = await rankItems(category, city, type, trucksOnly);
    if (!ranked.length) continue;
    charts.push({
      key: type, title: dishTypeTitle(type), entries: itemEntries(ranked, meta, 5), total: Math.min(ranked.length, CHART_SIZE),
      seeAll: trucksOnly ? null : withCity(`/charts/${kind}/${type}`, city),
    });
  }
  return charts.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}

/** A full Top 25 for one dish type, or across every plate / pour (dishType "all"). */
export async function itemChart(category: "food" | "drink", city: string, dishType: string, limit = CHART_SIZE): Promise<Chart> {
  const { ranked, meta } = await rankItems(category, city, dishType === "all" ? null : dishType);
  const noun = category === "food" ? "Plates" : "Pours";
  return {
    key: dishType, title: dishType === "all" ? noun : dishTypeTitle(dishType),
    entries: itemEntries(ranked, meta, limit), total: Math.min(ranked.length, CHART_SIZE),
    seeAll: limit < CHART_SIZE ? withCity(`/charts/${category === "food" ? "plates" : "pours"}/${dishType}`, city) : null,
  };
}

// ── Places and food trucks ─────────────────────────────────────────────
export const PLACE_DIMS: Record<"places" | "trucks", [PlaceDim, string][]> = {
  places: [["overall", "Places"], ["service_vybe", "Service Vybe"], ["aesthetic", "Aesthetic"], ["value", "Value"]],
  trucks: [["overall", "Food Trucks"], ["service_vybe", "Truck Service Vybe"], ["value", "Truck Value"]],
};

async function rankPlaces(city: string, trucks: boolean, dim: PlaceDim) {
  const groups = new Map<string, { meta: Biz; ratings: RatingRow[] }>();
  for (const r of await placeRows()) {
    if ((r.business.kind === "food_truck") !== trucks || !inCity(r.business, city)) continue;
    const v = r[dim];
    if (v == null) continue;
    const g = groups.get(r.business.id) ?? { meta: r.business, ratings: [] };
    g.ratings.push({ score: v, created_at: r.created_at });
    groups.set(r.business.id, g);
  }
  return rankGroups(groups);
}

export async function placeChart(city: string, trucks: boolean, dim: PlaceDim, limit = CHART_SIZE): Promise<Chart> {
  const kind = trucks ? "trucks" : "places";
  const title = PLACE_DIMS[kind].find(([d]) => d === dim)?.[1] ?? "Places";
  const { ranked, meta } = await rankPlaces(city, trucks, dim);
  return {
    key: dim, title, total: Math.min(ranked.length, CHART_SIZE),
    entries: ranked.slice(0, limit).map((s) => {
      const m = meta.get(s.subjectId)!;
      return { rank: s.rank, id: m.id, name: bizTitle(m), sub: "", href: bizHref(m), score: s.weightedMean, count: s.ratingCount };
    }),
    seeAll: limit < CHART_SIZE ? withCity(`/charts/${kind}/${dim}`, city) : null,
  };
}

export async function placeCharts(city: string, trucks: boolean): Promise<Chart[]> {
  return Promise.all(PLACE_DIMS[trucks ? "trucks" : "places"].map(([dim]) => placeChart(city, trucks, dim, 10)));
}

// ── Chefs ──────────────────────────────────────────────────────────────
export const CHEF_SERVICES_CHARTED: [string, string][] = [["private_chef", "Private Chefs"], ["catering", "Caterers"], ["meal_prep", "Meal Prep"]];

export async function chefChart(city: string, service: string, limit = CHART_SIZE): Promise<Chart> {
  const groups = new Map<string, { meta: ChefRow["chef"]; ratings: RatingRow[] }>();
  for (const r of await chefRows()) {
    if (r.service !== service || r.chef.city_slug !== city) continue;
    const g = groups.get(r.chef.id) ?? { meta: r.chef, ratings: [] };
    g.ratings.push({ score: r.food_quality, created_at: r.created_at });
    groups.set(r.chef.id, g);
  }
  const { ranked, meta } = rankGroups(groups, { minRatings: MIN_CHEF_REVIEWS_FOR_CHARTS, minEffectiveRatings: 3 });
  return {
    key: service, title: CHEF_SERVICES_CHARTED.find(([s]) => s === service)?.[1] ?? "Chefs", total: Math.min(ranked.length, CHART_SIZE),
    entries: ranked.slice(0, limit).map((s) => {
      const m = meta.get(s.subjectId)!;
      return { rank: s.rank, id: m.id, name: m.professional_name, sub: "", href: `/chef/${m.slug}`, score: s.weightedMean, count: s.ratingCount };
    }),
    seeAll: limit < CHART_SIZE ? withCity(`/charts/chefs/${service}`, city) : null,
  };
}

export async function chefCharts(city: string): Promise<Chart[]> {
  return Promise.all(CHEF_SERVICES_CHARTED.map(([svc]) => chefChart(city, svc, 10)));
}

// ── The VYBR8 25 ───────────────────────────────────────────────────────
/** The headline lists for a city: Top 25 places, plates and pours. */
export async function vybr8TwentyFive(city: string): Promise<Chart[]> {
  return Promise.all([placeChart(city, false, "overall"), itemChart("food", city, "all"), itemChart("drink", city, "all")]);
}

// ── Rank badges ────────────────────────────────────────────────────────
/** "#3 Places in Charlotte", "#1 Wings in Charlotte": only ranks inside the Top 25 are shown. */
export async function ranksForBusiness(businessId: string, city: string, cityName: string, isTruck = false): Promise<{ place: RankBadge | null; items: Record<string, RankBadge> }> {
  const kind = isTruck ? "trucks" : "places";
  const places = await rankPlaces(city, isTruck, "overall");
  const p = places.ranked.find((s) => s.subjectId === businessId);
  const place = p && p.rank <= CHART_SIZE
    ? { rank: p.rank, label: `${isTruck ? "Food Trucks" : "Places"} in ${cityName}`, href: withCity(`/charts/${kind}/overall`, city) }
    : null;

  const items: Record<string, RankBadge> = {};
  const mine = (await itemRows()).filter((r) => r.item.business.id === businessId && r.item.dish_type);
  const seen = new Set<string>();
  for (const r of mine) {
    const key = `${r.item.category}:${r.item.dish_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { ranked } = await rankItems(r.item.category, city, r.item.dish_type!);
    for (const s of ranked) {
      if (s.rank > CHART_SIZE) break;
      const row = mine.find((x) => x.item.id === s.subjectId);
      if (row) {
        items[s.subjectId] = {
          rank: s.rank,
          label: `${dishTypeTitle(r.item.dish_type!)} in ${cityName}`,
          href: withCity(`/charts/${r.item.category === "food" ? "plates" : "pours"}/${r.item.dish_type}`, city),
        };
      }
    }
  }
  return { place, items };
}
