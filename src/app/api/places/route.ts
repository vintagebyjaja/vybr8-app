import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type PlaceHit = { id: string; slug: string; name: string; branch: string | null; address: string | null; city: string | null; approved: boolean };

/** Type-ahead search for the place pickers: up to 8 places whose name matches, optionally in one city. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const city = sp.get("city");
  if (q.length < 2) return NextResponse.json({ places: [] });
  const safe = q.replace(/[%_\\,()*]/g, " ").replace(/\s+/g, " ").trim();
  if (!safe) return NextResponse.json({ places: [] });

  const supabase = await createClient();
  let query = supabase
    .from("businesses")
    .select("id, slug, name, branch_name, is_claimed, locations:business_locations!inner ( address_line1, city_slug )")
    .is("deleted_at", null)
    .eq("status", "active")
    .ilike("name", `%${safe}%`)
    .order("is_claimed", { ascending: false })
    .order("name")
    .limit(8);
  if (city && /^[a-z0-9-]{2,40}$/.test(city)) query = query.eq("locations.city_slug", city);
  const { data } = await query;
  type R = { id: string; slug: string; name: string; branch_name: string | null; is_claimed: boolean; locations: { address_line1: string | null; city_slug: string | null }[] };
  const places: PlaceHit[] = ((data ?? []) as unknown as R[]).map((r) => ({
    id: r.id, slug: r.slug, name: r.name, branch: r.branch_name,
    address: r.locations[0]?.address_line1 ?? null, city: r.locations[0]?.city_slug ?? null, approved: r.is_claimed,
  }));
  return NextResponse.json({ places }, { headers: { "cache-control": "private, max-age=30" } });
}
