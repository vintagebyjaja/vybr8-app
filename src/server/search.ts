import "server-only";
import { DRINK_KINDS, FOOD_KINDS, NIGHTLIFE_KINDS, type ParsedSearch } from "@/domain/search/intent";
import { createClient } from "@/lib/supabase/server";
import { listChefs, type ChefCard } from "@/server/chefs";
import { listTrucks, type TruckCard } from "@/server/trucks";

export type ItemHit = { id: string; name: string; businessSlug: string; businessName: string; businessKind: string; priceCents: number | null; avgScore: number | null; count: number; category: string };
export type PlaceHit = { id: string; slug: string; name: string; kind: string; description: string | null; overall: number | null; count: number };
export type SearchResults = { items: ItemHit[]; places: PlaceHit[]; chefs: ChefCard[]; trucks: TruckCard[] };

const clean = (t: string) => t.replace(/[%_,()]/g, "");

/** One search across dishes, drinks, places, chefs and food trucks. Every read runs under the viewer's RLS. */
export async function searchAll(p: ParsedSearch, citySlug: string): Promise<SearchResults> {
  const supabase = await createClient();
  const terms = p.terms.map(clean).filter(Boolean);
  const want = (t: ParsedSearch["tab"]) => p.tab === "all" || p.tab === t;

  const itemsQ = async (): Promise<ItemHit[]> => {
    if (!(want("food") || want("drinks") || p.tab === "nightlife") || !terms.length) return [];
    let q = supabase.from("menu_items").select("id, name, price_cents, category, dish_type, business:businesses!inner ( slug, name, kind )").limit(60);
    q = q.or(terms.flatMap((t) => [`name.ilike.%${t}%`, `dish_type.ilike.%${t}%`]).join(","));
    if (p.tab === "food") q = q.eq("category", "food");
    if (p.tab === "drinks") q = q.eq("category", "drink");
    const { data } = await q;
    type Row = { id: string; name: string; price_cents: number | null; category: string; business: { slug: string; name: string; kind: string } };
    const rows = (data ?? []) as unknown as Row[];
    if (!rows.length) return [];
    const { data: stats } = await supabase.from("menu_item_stats").select("menu_item_id, avg_score, rating_count").in("menu_item_id", rows.map((r) => r.id));
    const by = new Map(((stats ?? []) as { menu_item_id: string; avg_score: number | null; rating_count: number }[]).map((s) => [s.menu_item_id, s]));
    return rows
      .map((r) => ({ id: r.id, name: r.name, businessSlug: r.business.slug, businessName: r.business.name, businessKind: r.business.kind, priceCents: r.price_cents,
        avgScore: by.get(r.id)?.avg_score != null ? Number(by.get(r.id)!.avg_score) : null, count: by.get(r.id)?.rating_count ?? 0, category: r.category }))
      .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.count - a.count);
  };

  const placesQ = async (): Promise<PlaceHit[]> => {
    if (p.tab === "chefs" || p.tab === "trucks") return [];
    let q = supabase.from("businesses").select("id, slug, name, kind, description").is("deleted_at", null).limit(40);
    const kinds = p.tab === "drinks" ? DRINK_KINDS : p.tab === "nightlife" ? NIGHTLIFE_KINDS : p.tab === "food" ? FOOD_KINDS : null;
    if (kinds) q = q.in("kind", [...kinds]);
    if (terms.length && p.tab !== "nightlife") q = q.or(terms.flatMap((t) => [`name.ilike.%${t}%`, `description.ilike.%${t}%`]).join(","));
    const { data } = await q;
    const rows = (data ?? []) as { id: string; slug: string; name: string; kind: string; description: string | null }[];
    if (!rows.length) return [];
    const { data: stats } = await supabase.from("place_stats").select("business_id, overall, rating_count").in("business_id", rows.map((r) => r.id));
    const by = new Map(((stats ?? []) as { business_id: string; overall: number | null; rating_count: number }[]).map((s) => [s.business_id, s]));
    return rows.map((r) => ({ ...r, overall: by.get(r.id)?.overall != null ? Number(by.get(r.id)!.overall) : null, count: by.get(r.id)?.rating_count ?? 0 }))
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  };

  const chefsQ = async (): Promise<ChefCard[]> => {
    if (!want("chefs")) return [];
    const cuisine = p.tab === "chefs" ? terms[0] ?? null : null;
    const list = await listChefs({ city: citySlug, service: p.service, cuisine, accepting: false, maxBudget: p.maxBudget, guests: p.guests });
    return p.tab === "all" && terms.length ? list.filter((c) => terms.some((t) => c.name.toLowerCase().includes(t) || c.specialties.some((s) => s.toLowerCase().includes(t)))) : list;
  };

  const trucksQ = async (): Promise<TruckCard[]> => {
    if (!want("trucks")) return [];
    const list = await listTrucks(citySlug, p.openNow ? "open_now" : "all");
    const t = p.tab === "trucks" ? terms : terms;
    return t.length && p.tab === "all" ? list.filter((c) => t.some((w) => `${c.name} ${c.cuisine ?? ""}`.toLowerCase().includes(w))) : list;
  };

  const [items, places, chefs, trucks] = await Promise.all([itemsQ(), placesQ(), chefsQ(), trucksQ()]);
  return { items, places, chefs, trucks };
}
