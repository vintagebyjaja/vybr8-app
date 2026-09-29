import "server-only";
import { rankSubjects, type RankedSubject } from "@/domain/ranking/ranking";
import { createClient } from "@/lib/supabase/server";

/**
 * VYBR8 Charts. Ranked on confidence (Bayesian prior + recency), never raw averages, and never by payment.
 * Launch thresholds are lower than the long-term defaults so early cities get charts; raise them as data grows.
 */
export const CHART_THRESHOLDS = { minRatings: 3, minEffectiveRatings: 2 } as const;
export const MIN_CHEF_REVIEWS_FOR_CHARTS = 5;

export type ChartEntry = { rank: number; id: string; name: string; sub: string; href: string; score: number; count: number };
export type Chart = { key: string; title: string; entries: ChartEntry[] };

const title = (dishType: string) => dishType.split("-").map((w) => (w === "and" ? "&" : w[0]!.toUpperCase() + w.slice(1))).join(" ");

type RatingRow = { score: number | string; created_at: string };

function rank<T>(groups: Map<string, { meta: T; ratings: RatingRow[] }>, now: Date): { ranked: RankedSubject[]; meta: Map<string, T> } {
  const subjects = [...groups.entries()].map(([subjectId, g]) => ({ subjectId, ratings: g.ratings.map((r) => ({ score: Number(r.score), ratedAt: new Date(r.created_at) })) }));
  const { ranked } = rankSubjects(subjects, now, CHART_THRESHOLDS);
  return { ranked, meta: new Map([...groups.entries()].map(([k, g]) => [k, g.meta])) };
}

/** #1 Wings, #1 Margarita…: items ranked within their dish type. */
export async function itemCharts(category: "food" | "drink", trucksOnly = false): Promise<Chart[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("item_ratings")
    .select("score, created_at, item:menu_items!inner ( id, name, dish_type, category, business:businesses!inner ( slug, name, kind ) )")
    .eq("status", "published")
    .limit(10000);
  type Row = RatingRow & { item: { id: string; name: string; dish_type: string | null; category: string; business: { slug: string; name: string; kind: string } } };
  const byType = new Map<string, Map<string, { meta: Row["item"]; ratings: RatingRow[] }>>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (r.item.category !== category || !r.item.dish_type) continue;
    if (trucksOnly && r.item.business.kind !== "food_truck") continue;
    const g = byType.get(r.item.dish_type) ?? new Map();
    const s = g.get(r.item.id) ?? { meta: r.item, ratings: [] };
    s.ratings.push(r);
    g.set(r.item.id, s);
    byType.set(r.item.dish_type, g);
  }
  const now = new Date();
  const charts: Chart[] = [];
  for (const [type, groups] of byType) {
    const { ranked, meta } = rank(groups, now);
    if (!ranked.length) continue;
    charts.push({
      key: type, title: title(type),
      entries: ranked.slice(0, 5).map((s) => {
        const m = meta.get(s.subjectId)!;
        return { rank: s.rank, id: m.id, name: m.name, sub: m.business.name, href: m.business.kind === "food_truck" ? `/food-trucks/${m.business.slug}` : `/venue/${m.business.slug}`, score: s.weightedMean, count: s.ratingCount };
      }),
    });
  }
  return charts.sort((a, b) => b.entries.length - a.entries.length || a.title.localeCompare(b.title));
}

/** #1 Place, #1 Service Vybe, #1 Aesthetic, #1 Food Truck. */
export async function placeCharts(trucks: boolean): Promise<Chart[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("place_ratings")
    .select("overall, service_vybe, value, aesthetic, created_at, business:businesses!inner ( id, slug, name, kind )")
    .eq("status", "published")
    .limit(10000);
  type Row = { overall: number; service_vybe: number | null; value: number | null; aesthetic: number | null; created_at: string; business: { id: string; slug: string; name: string; kind: string } };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (r.business.kind === "food_truck") === trucks);
  const now = new Date();
  type Dim = "overall" | "service_vybe" | "value" | "aesthetic";
  const dims: [Dim, string][] = trucks
    ? [["overall", "#1 Food Truck"], ["service_vybe", "Service Vybe"], ["value", "Value"]]
    : [["overall", "Places"], ["service_vybe", "Service Vybe"], ["aesthetic", "Aesthetic"]];
  return dims.map(([dim, t]) => {
    const groups = new Map<string, { meta: Row["business"]; ratings: RatingRow[] }>();
    for (const r of rows) {
      const v = r[dim];
      if (v == null) continue;
      const g = groups.get(r.business.id) ?? { meta: r.business, ratings: [] };
      g.ratings.push({ score: v, created_at: r.created_at });
      groups.set(r.business.id, g);
    }
    const { ranked, meta } = rank(groups, now);
    return {
      key: dim, title: t,
      entries: ranked.slice(0, 10).map((s) => {
        const m = meta.get(s.subjectId)!;
        return { rank: s.rank, id: m.id, name: m.name, sub: "", href: trucks ? `/food-trucks/${m.slug}` : `/venue/${m.slug}`, score: s.weightedMean, count: s.ratingCount };
      }),
    };
  });
}

/** #1 Private Chef, #1 Caterer: only once chefs have enough verified reviews. */
export async function chefCharts(): Promise<Chart[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chef_reviews")
    .select("food_quality, created_at, service, chef:chef_profiles!inner ( id, slug, professional_name, verification )")
    .eq("status", "published")
    .limit(10000);
  type Row = { food_quality: number; created_at: string; service: string; chef: { id: string; slug: string; professional_name: string; verification: string } };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.chef.verification === "verified");
  const now = new Date();
  return ([["private_chef", "#1 Private Chef"], ["catering", "#1 Caterer"], ["meal_prep", "Meal Prep"]] as const).map(([svc, t]) => {
    const groups = new Map<string, { meta: Row["chef"]; ratings: RatingRow[] }>();
    for (const r of rows.filter((x) => x.service === svc)) {
      const g = groups.get(r.chef.id) ?? { meta: r.chef, ratings: [] };
      g.ratings.push({ score: r.food_quality, created_at: r.created_at });
      groups.set(r.chef.id, g);
    }
    const subjects = [...groups.entries()].map(([subjectId, g]) => ({ subjectId, ratings: g.ratings.map((x) => ({ score: Number(x.score), ratedAt: new Date(x.created_at) })) }));
    const { ranked } = rankSubjects(subjects, now, { minRatings: MIN_CHEF_REVIEWS_FOR_CHARTS, minEffectiveRatings: 3 });
    return {
      key: svc, title: t,
      entries: ranked.slice(0, 10).map((s) => {
        const m = groups.get(s.subjectId)!.meta;
        return { rank: s.rank, id: m.id, name: m.professional_name, sub: "", href: `/chef/${m.slug}`, score: s.weightedMean, count: s.ratingCount };
      }),
    };
  });
}
