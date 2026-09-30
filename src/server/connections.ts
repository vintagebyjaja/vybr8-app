import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConnectionTab = "followers" | "following" | "mutual";
export type Connection = {
  id: string; username: string; displayName: string | null; avatarPath: string | null;
  iFollow: boolean; followsMe: boolean; since: string;
};
export const PAGE_SIZE = 50;

/** Followers, following, or mutuals (people the viewer follows who also follow this person). Privacy is enforced in the database. */
export async function getConnections(userId: string, tab: ConnectionTab, offset = 0, limit = PAGE_SIZE): Promise<{ people: Connection[]; total: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("profile_connections", { p_user: userId, p_tab: tab, p_limit: limit, p_offset: offset });
  type Row = { id: string; username: string; display_name: string | null; avatar_url: string | null; i_follow: boolean; follows_me: boolean; since: string; total: number };
  const rows = (data ?? []) as Row[];
  return {
    total: rows.length ? Number(rows[0]!.total) : 0,
    people: rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name, avatarPath: r.avatar_url, iFollow: r.i_follow, followsMe: r.follows_me, since: r.since })),
  };
}
