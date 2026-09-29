import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReportGroup = { targetType: "post" | "comment"; targetId: string; preview: string; link: string | null; reasons: string[]; count: number; firstAt: string };
export type ModerationAction = {
  id: string; targetType: string; targetId: string; reason: string; takenAt: string; takenBy: string;
  founderDecision: "upheld" | "vetoed" | null; founderNote: string | null; preview: string;
};

/** Open reports grouped by what was reported. RLS returns reports only to the VYBR8 Team. */
export async function getOpenReports(): Promise<ReportGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("reports").select("target_type, target_id, reason, created_at").eq("status", "open").in("target_type", ["post", "comment"]).order("created_at").limit(300);
  const groups = new Map<string, ReportGroup>();
  for (const r of data ?? []) {
    const key = `${r.target_type}:${r.target_id}`;
    const g = groups.get(key) ?? { targetType: r.target_type as ReportGroup["targetType"], targetId: r.target_id as string, preview: "", link: null, reasons: [], count: 0, firstAt: r.created_at as string };
    g.count++;
    if (!g.reasons.includes(r.reason as string)) g.reasons.push(r.reason as string);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  await describe(list.map((g) => ({ type: g.targetType, id: g.targetId })), (i, preview, link) => { list[i]!.preview = preview; list[i]!.link = link; });
  return list;
}

export async function getModerationLog(): Promise<ModerationAction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("moderation_actions")
    .select("id, target_type, target_id, reason, taken_at, founder_decision, founder_note, taker:profiles!moderation_actions_taken_by_fkey ( username, display_name )")
    .order("taken_at", { ascending: false })
    .limit(60);
  type Row = { id: string; target_type: string; target_id: string; reason: string; taken_at: string; founder_decision: ModerationAction["founderDecision"]; founder_note: string | null; taker: { username: string; display_name: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  const list: ModerationAction[] = rows.map((r) => ({
    id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, takenAt: r.taken_at,
    takenBy: r.taker?.display_name ?? r.taker?.username ?? "Team", founderDecision: r.founder_decision, founderNote: r.founder_note, preview: "",
  }));
  await describe(list.map((a) => ({ type: a.targetType, id: a.targetId })), (i, preview) => { list[i]!.preview = preview; });
  return list;
}

/** Short human description of each target (team can read removed content). */
async function describe(items: { type: string; id: string }[], set: (i: number, preview: string, link: string | null) => void) {
  const supabase = await createClient();
  const ids = (t: string) => items.filter((x) => x.type === t).map((x) => x.id);
  const [posts, comments, linkups, perks] = await Promise.all([
    ids("post").length ? supabase.from("posts").select("id, kind, item_name, caption").in("id", ids("post")) : { data: [] },
    ids("comment").length ? supabase.from("post_comments").select("id, body, post_id").in("id", ids("comment")) : { data: [] },
    ids("linkup").length ? supabase.from("linkups").select("id, title").in("id", ids("linkup")) : { data: [] },
    ids("perk").length ? supabase.from("birthday_perks").select("id, title").in("id", ids("perk")) : { data: [] },
  ]);
  const by = new Map<string, { preview: string; link: string | null }>();
  for (const p of (posts.data ?? []) as { id: string; kind: string; item_name: string | null; caption: string | null }[]) by.set(p.id, { preview: `${p.kind}: ${p.item_name ?? p.caption ?? "photo post"}`, link: `/post/${p.id}` });
  for (const c of (comments.data ?? []) as { id: string; body: string; post_id: string }[]) by.set(c.id, { preview: `comment: “${c.body.slice(0, 120)}”`, link: `/post/${c.post_id}` });
  for (const l of (linkups.data ?? []) as { id: string; title: string }[]) by.set(l.id, { preview: `Link Up: ${l.title}`, link: `/vybe/${l.id}` });
  for (const p of (perks.data ?? []) as { id: string; title: string }[]) by.set(p.id, { preview: `perk: ${p.title}`, link: "/birthday" });
  items.forEach((x, i) => { const d = by.get(x.id); set(i, d?.preview ?? `${x.type} (no longer exists)`, d?.link ?? null); });
}
