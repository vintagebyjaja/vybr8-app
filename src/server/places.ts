import "server-only";
import type { PickedPlace } from "@/domain/places/places";
import { createClient } from "@/lib/supabase/server";

/** One place, shaped for a place picker's starting value (from a ?venue= slug or a saved id). */
export async function getPickedPlace(by: { slug?: string | null; id?: string | null }): Promise<PickedPlace | null> {
  if (!by.slug && !by.id) return null;
  const supabase = await createClient();
  let q = supabase.from("businesses").select("id, slug, name, branch_name, is_claimed, locations:business_locations ( address_line1, city_slug )").is("deleted_at", null);
  q = by.slug ? q.eq("slug", by.slug) : q.eq("id", by.id!);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const r = data as unknown as { id: string; slug: string; name: string; branch_name: string | null; is_claimed: boolean; locations: { address_line1: string | null; city_slug: string | null }[] };
  return { id: r.id, slug: r.slug, name: r.name, branch: r.branch_name, address: r.locations[0]?.address_line1 ?? null, city: r.locations[0]?.city_slug ?? null, approved: r.is_claimed };
}
