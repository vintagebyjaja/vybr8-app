import "server-only";
import { formatWhen, spotsLeft, type Occasion } from "@/domain/linkups/linkups";
import { findCity } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/server/auth";

export type LinkupCard = {
  id: string;
  title: string;
  occasion: Occasion;
  when: string;
  cityName: string;
  place: string | null;
  capacity: number;
  spotsLeft: number;
  visibility: "public" | "friends" | "invite_only";
  joinMode: "open" | "request";
  isAlcoholic: boolean;
  openToNewFriends: boolean;
  host: { username: string; name: string; avatarUrl: string | null };
  myStatus: string | null;
  isHost: boolean;
};

const CARD_SELECT =
  "id, title, occasion, starts_at, ends_at, city_slug, meet_point, capacity, visibility, join_mode, is_alcoholic, open_to_new_friends, host_id, business:businesses ( name ), host:profiles!linkups_host_id_fkey ( username, display_name, avatar_url )";

type Row = {
  id: string; title: string; occasion: Occasion; starts_at: string; ends_at: string; city_slug: string; meet_point: string | null;
  capacity: number; visibility: LinkupCard["visibility"]; join_mode: LinkupCard["joinMode"]; is_alcoholic: boolean; open_to_new_friends: boolean;
  host_id: string; business: { name: string } | null; host: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

async function toCards(rows: Row[], viewer: Viewer | null, statusBy: Map<string, string>): Promise<LinkupCard[]> {
  if (!rows.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("linkup_spots", { p_ids: rows.map((r) => r.id) });
  const taken = new Map(((data ?? []) as { linkup_id: string; taken: number }[]).map((s) => [s.linkup_id, s.taken]));
  return rows.map((r) => {
    const city = findCity(r.city_slug);
    return {
      id: r.id, title: r.title, occasion: r.occasion, when: formatWhen(new Date(r.starts_at), city.timezone), cityName: city.name,
      place: r.business?.name ?? r.meet_point, capacity: r.capacity, spotsLeft: spotsLeft(r.capacity, taken.get(r.id) ?? 1),
      visibility: r.visibility, joinMode: r.join_mode, isAlcoholic: r.is_alcoholic, openToNewFriends: r.open_to_new_friends,
      host: { username: r.host?.username ?? "host", name: r.host?.display_name ?? r.host?.username ?? "Host", avatarUrl: r.host?.avatar_url ?? null },
      myStatus: statusBy.get(r.id) ?? null, isHost: viewer?.id === r.host_id,
    };
  });
}

/** Link Ups I'm hosting, going to, invited to, or waiting on. */
export async function getMyLinkups(viewer: Viewer): Promise<LinkupCard[]> {
  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("linkup_members")
    .select("linkup_id, status")
    .eq("user_id", viewer.id)
    .in("status", ["going", "requested", "invited"]);
  const statusBy = new Map((mine ?? []).map((m) => [m.linkup_id as string, m.status as string]));
  if (!statusBy.size) return [];
  const { data } = await supabase
    .from("linkups")
    .select(CARD_SELECT)
    .in("id", [...statusBy.keys()])
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at");
  return toCards((data ?? []) as unknown as Row[], viewer, statusBy);
}

/** Public (and friends-only) Link Ups in a city that the viewer can see and hasn't joined. */
export async function getCityLinkups(citySlug: string, viewer: Viewer, exclude: Set<string>): Promise<LinkupCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("linkups")
    .select(CARD_SELECT)
    .eq("city_slug", findCity(citySlug).slug)
    .eq("status", "active")
    .in("visibility", ["public", "friends"])
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(40);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => !exclude.has(r.id));
  return toCards(rows, viewer, new Map());
}

export type LinkupDetail = LinkupCard & {
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "active" | "cancelled";
  isOver: boolean;
  business: { slug: string; name: string; address: string | null } | null;
  members: { userId: string; username: string; name: string; avatarUrl: string | null; status: string; isHost: boolean }[];
  guests: { id: string; label: string | null; status: string; guestName: string | null }[];
  canChat: boolean;
};

export async function getLinkup(id: string, viewer: Viewer): Promise<LinkupDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("linkups")
    .select(`${CARD_SELECT}, description, status, business_full:businesses ( slug, name, locations:business_locations ( address_line1, city, region, is_primary ) )`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Row & {
    description: string | null; status: "active" | "cancelled";
    business_full: { slug: string; name: string; locations: { address_line1: string | null; city: string; region: string; is_primary: boolean }[] } | null;
  };

  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    supabase
      .from("linkup_members")
      .select("user_id, status, is_host, profile:profiles!linkup_members_user_id_fkey ( username, display_name, avatar_url )")
      .eq("linkup_id", id)
      .in("status", ["going", "requested", "invited"])
      .order("created_at"),
    viewer.id === row.host_id
      ? supabase.from("linkup_invites").select("id, label, status, guest_name").eq("linkup_id", id).neq("status", "revoked").order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  type M = { user_id: string; status: string; is_host: boolean; profile: { username: string; display_name: string | null; avatar_url: string | null } | null };
  const members = ((memberRows ?? []) as unknown as M[]).map((m) => ({
    userId: m.user_id, username: m.profile?.username ?? "member", name: m.profile?.display_name ?? m.profile?.username ?? "Member", avatarUrl: m.profile?.avatar_url ?? null, status: m.status, isHost: m.is_host,
  }));
  const me = members.find((m) => m.userId === viewer.id)?.status ?? null;
  const [card] = await toCards([row], viewer, new Map(me ? [[id, me]] : []));
  const loc = row.business_full?.locations.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
  const isOver = row.status !== "active" || new Date(row.ends_at) < new Date();
  return {
    ...card!,
    description: row.description, startsAt: row.starts_at, endsAt: row.ends_at, timezone: findCity(row.city_slug).timezone,
    status: row.status, isOver,
    business: row.business_full ? { slug: row.business_full.slug, name: row.business_full.name, address: loc ? [loc.address_line1, loc.city, loc.region].filter(Boolean).join(", ") : null } : null,
    members,
    guests: ((inviteRows ?? []) as { id: string; label: string | null; status: string; guest_name: string | null }[]).map((g) => ({ id: g.id, label: g.label, status: g.status, guestName: g.guest_name })),
    canChat: !isOver && (card!.isHost || me === "going"),
  };
}

/** Friends the host could invite (accepted friendships). */
export async function getInvitableFriends(viewer: Viewer, linkupId: string): Promise<{ id: string; username: string; name: string }[]> {
  const supabase = await createClient();
  const { data: fr } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${viewer.id},addressee_id.eq.${viewer.id}`)
    .limit(200);
  const ids = (fr ?? []).map((f) => (f.requester_id === viewer.id ? f.addressee_id : f.requester_id) as string);
  if (!ids.length) return [];
  const [{ data: profiles }, { data: already }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name").in("id", ids),
    supabase.from("linkup_members").select("user_id").eq("linkup_id", linkupId).in("status", ["going", "requested", "invited", "removed"]),
  ]);
  const skip = new Set((already ?? []).map((a) => a.user_id as string));
  return (profiles ?? [])
    .filter((p) => !skip.has(p.id as string))
    .map((p) => ({ id: p.id as string, username: p.username as string, name: (p.display_name as string | null) ?? (p.username as string) }));
}

export type ChatMessage = { id: string; author: string; isGuest: boolean; isMe: boolean; body: string; createdAt: string };
export function toChat(rows: unknown): ChatMessage[] {
  return ((rows ?? []) as { id: string; author: string | null; is_guest: boolean; is_me: boolean | null; body: string; created_at: string }[]).map((m) => ({
    id: m.id, author: m.author ?? "Someone", isGuest: m.is_guest, isMe: !!m.is_me, body: m.body, createdAt: m.created_at,
  }));
}
