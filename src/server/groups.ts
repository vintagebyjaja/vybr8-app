import "server-only";
import type { Candidate, GroupKind, Relationship, Taster } from "@/domain/groups/groups";
import { suggestForGroup, type PlaceSuggestion } from "@/domain/groups/groups";
import { findCity } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/server/auth";

export type Taste = { likes: string[]; dislikes: string[]; allergies: string[]; dietary: string[]; spice: number | null; kidsMenu: boolean; notes: string | null };
const EMPTY_TASTE: Taste = { likes: [], dislikes: [], allergies: [], dietary: [], spice: null, kidsMenu: false, notes: null };
type TasteRow = { user_id: string | null; dependent_id: string | null; likes: string[]; dislikes: string[]; allergies: string[]; dietary: string[]; spice: number | null; kids_menu: boolean; notes: string | null };
const toTaste = (r: TasteRow | null | undefined): Taste =>
  r ? { likes: r.likes ?? [], dislikes: r.dislikes ?? [], allergies: r.allergies ?? [], dietary: r.dietary ?? [], spice: r.spice, kidsMenu: r.kids_menu, notes: r.notes } : EMPTY_TASTE;

export type GroupCard = { id: string; name: string; kind: GroupKind; description: string | null; myStatus: "invited" | "active"; myRole: string; memberCount: number; faces: { name: string; avatarUrl: string | null; isKid: boolean }[]; invitedBy: string | null };

export async function getMyGroups(viewer: Viewer): Promise<GroupCard[]> {
  const supabase = await createClient();
  const { data: mine } = await supabase.from("group_members").select("group_id, status, role, inviter:profiles!group_members_invited_by_fkey ( display_name, username )").eq("user_id", viewer.id);
  const rows = (mine ?? []) as unknown as { group_id: string; status: "invited" | "active"; role: string; inviter: { display_name: string | null; username: string } | null }[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.group_id);
  const [{ data: groups }, { data: members }] = await Promise.all([
    supabase.from("groups").select("id, name, kind, description, created_at").in("id", ids).order("created_at"),
    supabase.from("group_members").select("group_id, status, profile:profiles!group_members_user_id_fkey ( display_name, username, avatar_url ), kid:dependents ( first_name )").in("group_id", ids).eq("status", "active"),
  ]);
  type M = { group_id: string; profile: { display_name: string | null; username: string; avatar_url: string | null } | null; kid: { first_name: string } | null };
  const byGroup = new Map<string, M[]>();
  for (const m of (members ?? []) as unknown as M[]) byGroup.set(m.group_id, [...(byGroup.get(m.group_id) ?? []), m]);
  return ((groups ?? []) as { id: string; name: string; kind: GroupKind; description: string | null }[]).map((g) => {
    const me = rows.find((r) => r.group_id === g.id)!;
    const ms = byGroup.get(g.id) ?? [];
    return {
      ...g, myStatus: me.status, myRole: me.role, memberCount: ms.length,
      faces: ms.slice(0, 6).map((m) => ({ name: m.profile?.display_name ?? m.profile?.username ?? m.kid?.first_name ?? "?", avatarUrl: m.profile?.avatar_url ?? null, isKid: !!m.kid })),
      invitedBy: me.inviter ? me.inviter.display_name ?? me.inviter.username : null,
    };
  });
}

export type Kid = { id: string; firstName: string; birthdate: string | null; claimed: boolean; claimedUsername: string | null; taste: Taste; guardians: string[] };

export async function getMyKids(viewer: Viewer): Promise<Kid[]> {
  const supabase = await createClient();
  const { data: g } = await supabase.from("dependent_guardians").select("dependent_id").eq("user_id", viewer.id);
  const ids = (g ?? []).map((x) => x.dependent_id as string);
  if (!ids.length) return [];
  return Promise.all(ids.map((id) => getKid(id))).then((list) => list.filter((k): k is Kid => !!k));
}

export async function getKid(id: string): Promise<Kid | null> {
  const supabase = await createClient();
  const [{ data: d }, { data: t }, { data: gs }] = await Promise.all([
    supabase.from("dependents").select("id, first_name, birthdate, claimed_by, claimer:profiles!dependents_claimed_by_fkey ( username )").eq("id", id).maybeSingle(),
    supabase.from("taste_profiles").select("*").eq("dependent_id", id).maybeSingle(),
    supabase.from("dependent_guardians").select("profile:profiles!dependent_guardians_user_id_fkey ( display_name, username )").eq("dependent_id", id),
  ]);
  if (!d) return null;
  const row = d as unknown as { id: string; first_name: string; birthdate: string | null; claimed_by: string | null; claimer: { username: string } | null };
  return {
    id: row.id, firstName: row.first_name, birthdate: row.birthdate, claimed: !!row.claimed_by, claimedUsername: row.claimer?.username ?? null,
    taste: toTaste(t as TasteRow | null),
    guardians: ((gs ?? []) as unknown as { profile: { display_name: string | null; username: string } | null }[]).map((x) => x.profile?.display_name ?? x.profile?.username ?? "Guardian"),
  };
}

export async function getMyTaste(viewer: Viewer): Promise<Taste> {
  const supabase = await createClient();
  const { data } = await supabase.from("taste_profiles").select("*").eq("user_id", viewer.id).maybeSingle();
  return toTaste(data as TasteRow | null);
}

export type GroupMember = {
  memberId: string; userId: string | null; dependentId: string | null; name: string; username: string | null; avatarUrl: string | null;
  isKid: boolean; role: string; status: "invited" | "active"; relationship: Relationship; taste: Taste; iAmGuardian: boolean;
};
export type PlanPick = { id: string; memberId: string; itemId: string; itemName: string; priceCents: number | null; note: string | null };
export type GroupPlan = { id: string; title: string; plannedFor: string | null; status: string; notes: string | null; business: { id: string; slug: string; name: string } | null; picks: PlanPick[] };
export type GroupDetail = {
  id: string; name: string; kind: GroupKind; description: string | null; citySlug: string; ownerId: string;
  myRole: string | null; myStatus: "invited" | "active" | null; members: GroupMember[]; plans: GroupPlan[];
};

export async function getGroup(id: string, viewer: Viewer): Promise<GroupDetail | null> {
  const supabase = await createClient();
  const { data: g } = await supabase.from("groups").select("id, name, kind, description, city_slug, owner_id").eq("id", id).maybeSingle();
  if (!g) return null;
  const [{ data: ms }, { data: plans }, { data: guard }] = await Promise.all([
    supabase.from("group_members")
      .select("id, user_id, dependent_id, role, status, relationship, profile:profiles!group_members_user_id_fkey ( display_name, username, avatar_url ), kid:dependents ( first_name )")
      .eq("group_id", id).order("created_at"),
    supabase.from("group_plans")
      .select("id, title, planned_for, status, notes, business:businesses ( id, slug, name ), picks:group_plan_picks ( id, member_id, note, item:menu_items ( id, name, price_cents ) )")
      .eq("group_id", id).neq("status", "cancelled").order("planned_for", { ascending: true, nullsFirst: false }),
    supabase.from("dependent_guardians").select("dependent_id").eq("user_id", viewer.id),
  ]);
  type MRow = { id: string; user_id: string | null; dependent_id: string | null; role: string; status: "invited" | "active"; relationship: Relationship;
    profile: { display_name: string | null; username: string; avatar_url: string | null } | null; kid: { first_name: string } | null };
  const mrows = (ms ?? []) as unknown as MRow[];
  const userIds = mrows.map((m) => m.user_id).filter((x): x is string => !!x);
  const depIds = mrows.map((m) => m.dependent_id).filter((x): x is string => !!x);
  const [{ data: ut }, { data: dt }] = await Promise.all([
    userIds.length ? supabase.from("taste_profiles").select("*").in("user_id", userIds) : Promise.resolve({ data: [] }),
    depIds.length ? supabase.from("taste_profiles").select("*").in("dependent_id", depIds) : Promise.resolve({ data: [] }),
  ]);
  const tastes = [...((ut ?? []) as TasteRow[]), ...((dt ?? []) as TasteRow[])];
  const myKids = new Set((guard ?? []).map((x) => x.dependent_id as string));
  const me = mrows.find((m) => m.user_id === viewer.id);
  type PRow = { id: string; title: string; planned_for: string | null; status: string; notes: string | null; business: { id: string; slug: string; name: string } | null;
    picks: { id: string; member_id: string; note: string | null; item: { id: string; name: string; price_cents: number | null } | null }[] };
  return {
    id: g.id as string, name: g.name as string, kind: g.kind as GroupKind, description: g.description as string | null,
    citySlug: findCity(g.city_slug as string | null).slug, ownerId: g.owner_id as string,
    myRole: me?.role ?? null, myStatus: me?.status ?? null,
    members: mrows.map((m) => ({
      memberId: m.id, userId: m.user_id, dependentId: m.dependent_id,
      name: m.profile?.display_name ?? m.profile?.username ?? m.kid?.first_name ?? "Member", username: m.profile?.username ?? null,
      avatarUrl: m.profile?.avatar_url ?? null, isKid: !!m.dependent_id, role: m.role, status: m.status, relationship: m.relationship,
      taste: toTaste(tastes.find((t) => (m.user_id && t.user_id === m.user_id) || (m.dependent_id && t.dependent_id === m.dependent_id))),
      iAmGuardian: !!m.dependent_id && myKids.has(m.dependent_id),
    })),
    plans: ((plans ?? []) as unknown as PRow[]).map((p) => ({
      id: p.id, title: p.title, plannedFor: p.planned_for, status: p.status, notes: p.notes, business: p.business,
      picks: p.picks.filter((x) => x.item).map((x) => ({ id: x.id, memberId: x.member_id, itemId: x.item!.id, itemName: x.item!.name, priceCents: x.item!.price_cents, note: x.note })),
    })),
  };
}

/** "VYBR8, where should we go?" Places in the group's city where the most people have something they'll like. */
export async function getGroupSuggestions(group: GroupDetail, viewer: Viewer): Promise<PlaceSuggestion[]> {
  const active = group.members.filter((m) => m.status === "active");
  const withTastes = active.filter((m) => m.taste.likes.length);
  if (!withTastes.length) return [];
  const supabase = await createClient();
  const { data: locs } = await supabase.from("business_locations").select("business_id").eq("city_slug", group.citySlug).limit(500);
  const bizIds = [...new Set((locs ?? []).map((l) => l.business_id as string))];
  const { data: trucks } = await supabase.from("food_truck_profiles").select("business_id").eq("home_city_slug", group.citySlug);
  for (const t of trucks ?? []) bizIds.push(t.business_id as string);
  if (!bizIds.length) return [];
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, description, dish_type, category, is_alcoholic, is_available, business:businesses!inner ( id, slug, name )")
    .in("business_id", bizIds).eq("is_available", true).limit(1500);
  type IRow = { id: string; name: string; description: string | null; dish_type: string | null; category: "food" | "drink"; is_alcoholic: boolean; business: { id: string; slug: string; name: string } };
  const irows = (items ?? []) as unknown as IRow[];
  const { data: stats } = irows.length ? await supabase.from("menu_item_stats").select("menu_item_id, avg_score").in("menu_item_id", irows.map((i) => i.id)) : { data: [] };
  const score = new Map(((stats ?? []) as { menu_item_id: string; avg_score: number | null }[]).map((s) => [s.menu_item_id, s.avg_score == null ? null : Number(s.avg_score)]));
  const candidates: Candidate[] = irows.map((i) => ({
    id: i.id, name: i.name, description: i.description, dishType: i.dish_type, category: i.category, isAlcoholic: i.is_alcoholic,
    businessId: i.business.id, businessName: i.business.name, businessSlug: i.business.slug, avgScore: score.get(i.id) ?? null,
  }));
  const tasters: Taster[] = withTastes.map((m) => ({
    memberId: m.memberId, name: m.name, isKid: m.isKid,
    canDrink: m.userId === viewer.id && viewer.is21Plus,   // we never assume anyone else's age
    likes: m.taste.likes, dislikes: m.taste.dislikes, allergies: m.taste.allergies, dietary: m.taste.dietary, kidsMenu: m.taste.kidsMenu,
  }));
  return suggestForGroup(tasters, candidates);
}
