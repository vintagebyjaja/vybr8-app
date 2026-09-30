import "server-only";
import { EAT_TYPES, type EatSort, type EatType } from "@/domain/places/eat";
import { createClient } from "@/lib/supabase/server";

export type NearPlace = {
  businessId: string; slug: string; name: string; branch: string | null; kind: string; cuisines: string[]; priceLevel: number | null;
  approved: boolean; logoUrl: string | null; address: string | null; meters: number; openNow: boolean | null; rating: number | null; ratings: number; match: number;
  badges: string[];
  saved: boolean;
};

export const EAT_PAGE = 30;

/** Every place near a point (or downtown), with filters. Runs under the viewer's access rules. */
export async function getPlacesNear(o: {
  city: string; lat: number | null; lng: number | null; type: EatType; cuisine: string | null; q: string | null; openNow: boolean;
  likes: string[]; dislikes: string[]; sort: EatSort; page: number; badge: string | null; savedOnly: boolean;
}): Promise<NearPlace[]> {
  const supabase = await createClient();
  const kinds = EAT_TYPES.find((t) => t.key === o.type)?.kinds ?? null;
  const { data } = await supabase.rpc("places_near", {
    p_city: o.city, p_lat: o.lat, p_lng: o.lng, p_kinds: kinds ? [...kinds] : null, p_cuisine: o.cuisine, p_q: o.q, p_open_now: o.openNow,
    p_likes: o.likes, p_dislikes: o.dislikes, p_sort: o.sort, p_limit: EAT_PAGE + 1, p_offset: (o.page - 1) * EAT_PAGE, p_badge: o.badge, p_saved_only: o.savedOnly,
  });
  type R = { business_id: string; slug: string; name: string; branch_name: string | null; kind: string; cuisines: string[] | null; price_level: number | null;
    approved: boolean; logo_url: string | null; address: string | null; meters: number; open_now: boolean | null; rating: number | string | null; ratings: number; match: number; badges: string[] | null; saved: boolean | null };
  return ((data ?? []) as R[]).map((r) => ({
    businessId: r.business_id, slug: r.slug, name: r.name, branch: r.branch_name, kind: r.kind, cuisines: r.cuisines ?? [], priceLevel: r.price_level,
    approved: r.approved, logoUrl: r.logo_url, address: r.address, meters: Number(r.meters), openNow: r.open_now,
    rating: r.rating == null ? null : Number(r.rating), ratings: r.ratings, match: r.match, badges: r.badges ?? [], saved: !!r.saved,
  }));
}

export async function getCityCuisines(city: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("city_cuisines", { p_city: city, p_limit: 16 });
  return ((data ?? []) as { cuisine: string }[]).map((r) => r.cuisine);
}
