import "server-only";
import type { PendingApplication } from "@/domain/posts/feed-types";
import type { CreatorType } from "@/domain/posts/posts";
import { createClient } from "@/lib/supabase/server";

export type { PendingApplication };

/** Pending creator applications, oldest first. RLS only returns rows to VYBR8 staff. */
export async function getPendingApplications(limit = 50): Promise<{ items: PendingApplication[]; total: number }> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("creator_applications")
    .select("id, creator_type, city, pitch, links, is_21_plus_attested, created_at, user_id, proof_code, proof_confirmed_at, applicant:profiles!creator_applications_user_id_fkey ( username, display_name )", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = data ?? [];
  const userIds = rows.map((r) => r.user_id as string);
  const counts = new Map<string, number>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { count: c } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", uid).is("deleted_at", null);
      counts.set(uid, c ?? 0);
    }),
  );

  return {
    total: count ?? rows.length,
    items: rows.map((r) => {
      const a = (Array.isArray(r.applicant) ? r.applicant[0] : r.applicant) as { username: string; display_name: string | null } | null;
      return {
        id: r.id as string,
        creatorType: r.creator_type as CreatorType,
        city: r.city as string | null,
        pitch: r.pitch as string,
        links: Array.isArray(r.links) ? (r.links as PendingApplication["links"]) : [],
        is21PlusAttested: r.is_21_plus_attested as boolean,
        proofCode: (r.proof_code as string | null) ?? "",
        proofConfirmed: !!r.proof_confirmed_at,
        createdAt: r.created_at as string,
        applicant: { id: r.user_id as string, username: a?.username ?? "unknown", displayName: a?.display_name ?? null, postCount: counts.get(r.user_id as string) ?? 0 },
      };
    }),
  };
}

export async function getCreatorsForTeam() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("creator_profiles")
    .select("user_id, creator_type, status, verified_at, profile:profiles!creator_profiles_user_id_fkey ( username, display_name )")
    .order("verified_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((c) => {
    const p = (Array.isArray(c.profile) ? c.profile[0] : c.profile) as { username: string; display_name: string | null } | null;
    return {
      userId: c.user_id as string,
      creatorType: c.creator_type as CreatorType,
      status: c.status as "verified" | "suspended",
      verifiedAt: c.verified_at as string,
      username: p?.username ?? "unknown",
      displayName: p?.display_name ?? null,
    };
  });
}
