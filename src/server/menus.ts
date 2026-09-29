import "server-only";
import type { MenuItemView } from "@/domain/menus/menus";
import { createClient } from "@/lib/supabase/server";

export type { MenuItemView };

/** A place's menu with scores. RLS hides alcohol items from people who can't see Pours yet. */
export async function getMenu(businessId: string, viewerId: string | null): Promise<MenuItemView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("menu_items")
    .select("id, name, description, category, section, dish_type, price_cents, is_alcoholic, is_available, sold_out_until, position, credits:chef_menu_item_attributions ( attribution_type, verification_status, end_date, chef:chef_profiles ( slug, professional_name ) )")
    .eq("business_id", businessId)
    .order("position");
  type Row = {
    id: string; name: string; description: string | null; category: "food" | "drink"; section: string | null; dish_type: string | null; price_cents: number | null;
    is_alcoholic: boolean; is_available: boolean; sold_out_until: string | null;
    credits: { attribution_type: string; verification_status: string; end_date: string | null; chef: { slug: string; professional_name: string } | null }[];
  };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: stats }, { data: mine }] = await Promise.all([
    supabase.from("menu_item_stats").select("menu_item_id, avg_score, rating_count").in("menu_item_id", ids),
    viewerId ? supabase.from("item_ratings").select("menu_item_id, score").eq("user_id", viewerId).in("menu_item_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const statBy = new Map(((stats ?? []) as { menu_item_id: string; avg_score: number | null; rating_count: number }[]).map((s) => [s.menu_item_id, s]));
  const mineBy = new Map(((mine ?? []) as { menu_item_id: string; score: number }[]).map((s) => [s.menu_item_id, Number(s.score)]));
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    id: r.id, name: r.name, description: r.description, category: r.category, section: r.section, dishType: r.dish_type,
    priceCents: r.price_cents, isAlcoholic: r.is_alcoholic,
    soldOut: !r.is_available || (!!r.sold_out_until && new Date(r.sold_out_until) > new Date()),
    avgScore: statBy.get(r.id)?.avg_score != null ? Number(statBy.get(r.id)!.avg_score) : null,
    ratingCount: statBy.get(r.id)?.rating_count ?? 0,
    myScore: mineBy.get(r.id) ?? null,
    chefs: r.credits
      .filter((c) => c.chef && c.verification_status !== "self_reported" && (!c.end_date || c.end_date >= today))
      .map((c) => ({ slug: c.chef!.slug, name: c.chef!.professional_name, type: c.attribution_type })),
  }));
}

export type PlaceStats = { overall: number | null; serviceVybe: number | null; value: number | null; aesthetic: number | null; count: number };
export async function getPlaceStats(businessId: string): Promise<PlaceStats> {
  const supabase = await createClient();
  const { data } = await supabase.from("place_stats").select("overall, service_vybe, value, aesthetic, rating_count").eq("business_id", businessId).maybeSingle();
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { overall: n(data?.overall), serviceVybe: n(data?.service_vybe), value: n(data?.value), aesthetic: n(data?.aesthetic), count: (data?.rating_count as number | undefined) ?? 0 };
}
