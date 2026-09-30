import "server-only";
import { isLinkKind, type LinkKind } from "@/domain/places/links";
import { createClient } from "@/lib/supabase/server";

export type PlaceLink = { kind: LinkKind; url: string; source: "osm" | "owner" | "team" | "community"; mine: boolean };

/** Links for many places at once (menus, socials, delivery, reservations). */
export async function getPlaceLinks(businessIds: string[], viewerId: string | null = null): Promise<Map<string, PlaceLink[]>> {
  const out = new Map<string, PlaceLink[]>();
  const ids = [...new Set(businessIds)].slice(0, 200);
  if (!ids.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("place_links").select("business_id, kind, url, source, added_by").in("business_id", ids);
  for (const r of (data ?? []) as { business_id: string; kind: string; url: string; source: PlaceLink["source"]; added_by: string | null }[]) {
    if (!isLinkKind(r.kind)) continue;
    const list = out.get(r.business_id) ?? [];
    list.push({ kind: r.kind, url: r.url, source: r.source, mine: !!viewerId && r.added_by === viewerId });
    out.set(r.business_id, list);
  }
  return out;
}
