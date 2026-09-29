import "server-only";
import type { PerkWindow } from "@/domain/birthday/birthday";
import type { BirthdayPerk, PerkType } from "@/domain/birthday/perks";

export type { BirthdayPerk, PerkType };
import { createClient } from "@/lib/supabase/server";

const SELECT = `id, title, details, perk_type, redeem_window, requirements, is_alcoholic, source, status, last_confirmed_at, is_demo,
  business:businesses ( id, slug, name, kind, locations:business_locations ( city, is_primary ) )`;

type Row = {
  id: string; title: string; details: string | null; perk_type: PerkType; redeem_window: PerkWindow; requirements: string | null;
  is_alcoholic: boolean; source: BirthdayPerk["source"]; status: BirthdayPerk["status"]; last_confirmed_at: string | null; is_demo: boolean;
  business: { id: string; slug: string; name: string; kind: string; locations: { city: string; is_primary: boolean }[] } | null;
};

const map = (r: Row): BirthdayPerk | null =>
  r.business
    ? {
        id: r.id, title: r.title, details: r.details, perkType: r.perk_type, window: r.redeem_window, requirements: r.requirements,
        isAlcoholic: r.is_alcoholic, source: r.source, status: r.status, lastConfirmedAt: r.last_confirmed_at, isDemo: r.is_demo,
        business: {
          id: r.business.id, slug: r.business.slug, name: r.business.name, kind: r.business.kind,
          city: (r.business.locations.find((l) => l.is_primary) ?? r.business.locations[0])?.city ?? null,
        },
      }
    : null;

export async function getBirthdayPerks(opts: { type?: PerkType; businessId?: string } = {}): Promise<BirthdayPerk[]> {
  const supabase = await createClient();
  let q = supabase.from("birthday_perks").select(SELECT).eq("status", "active").order("last_confirmed_at", { ascending: false, nullsFirst: false }).limit(300);
  if (opts.type) q = q.eq("perk_type", opts.type);
  if (opts.businessId) q = q.eq("business_id", opts.businessId);
  const { data } = await q;
  return ((data ?? []) as unknown as Row[]).map(map).filter((p): p is BirthdayPerk => p !== null);
}

/** Pending community tips. RLS returns them only to the VYBR8 team (and the person who suggested them). */
export async function getPendingPerks(): Promise<BirthdayPerk[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("birthday_perks").select(SELECT).eq("status", "pending").order("created_at").limit(100);
  return ((data ?? []) as unknown as Row[]).map(map).filter((p): p is BirthdayPerk => p !== null);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}

export async function getNotifications(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
