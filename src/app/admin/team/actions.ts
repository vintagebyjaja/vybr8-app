"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { log } from "@/server/log";
import { CITIES } from "@/domain/map/map";
import { isTeamPosition, positionInfo, teamTitle, type TeamPosition } from "@/domain/team/positions";

/** Position → access level and badge title. The role always comes from the position, never from the form. */
function placement(form: FormData): { role: "admin" | "moderator"; title: string } | null {
  const pos = form.get("position");
  if (!isTeamPosition(pos)) return null;
  const city = CITIES.find((c) => c.slug === form.get("city"))?.name ?? null;
  return { role: positionInfo(pos as TeamPosition).role, title: teamTitle(pos as TeamPosition, city) };
}

const back = (params: Record<string, string>): never => redirect(`/admin/team?${new URLSearchParams(params)}`);
/** Database messages written for people pass through; anything technical becomes a generic retry. */
const friendly = (m: string) => (/violates|syntax|permission denied|duplicate key|null value|invalid input/i.test(m) ? "That didn't work. Try again." : m);

// The database checks that you're the founder; this re-checks you're an admin first (defense in depth).
export async function setTeamMember(form: FormData) {
  await requireAdmin();
  const p = z.object({
    username: z.string().trim().min(2).max(40),
    bio: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(280).optional()),
  }).safeParse(Object.fromEntries(form));
  const place = placement(form);
  if (!p.success || !place) back({ e: "Add their username and pick a position." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_set_member", { p_username: p.data!.username, p_role: place!.role, p_title: place!.title, p_bio: p.data!.bio ?? null });
  if (error) {
    log.warn("team.set_failed", { code: error.code });
    back({ e: friendly(error.message) });
  }
  revalidatePath("/admin/team");
  revalidatePath("/team");
  back({ saved: p.data!.username.replace(/^@/, "") });
}

export async function removeTeamMember(form: FormData) {
  await requireAdmin();
  const id = z.uuid().safeParse(form.get("user"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_remove_member", { p_user: id.data });
  if (error) back({ e: friendly(error.message) });
  revalidatePath("/admin/team");
  revalidatePath("/team");
  back({ removed: "1" });
}

/** Answer an "I want to join the VYBR8 Team" request from Help & Support. */
export async function answerJoinRequest(form: FormData) {
  await requireAdmin();
  const p = z.object({
    ticket: z.uuid(),
    decision: z.enum(["accept", "decline"]),
    username: z.string().max(40).optional(),
  }).safeParse(Object.fromEntries(form));
  const accept = p.success && p.data.decision === "accept";
  const place = placement(form);
  if (!p.success || (accept && !place)) back({ e: "Pick a position, then try again." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_answer_request", {
    p_ticket: p.data!.ticket, p_accept: accept, p_role: place?.role ?? "moderator", p_title: place?.title ?? null,
  });
  if (error) {
    log.warn("team.request_failed", { code: error.code });
    back({ e: friendly(error.message) });
  }
  revalidatePath("/admin/team");
  revalidatePath("/team");
  revalidatePath("/admin/support");
  back(accept && p.data!.username ? { saved: p.data!.username } : { declined: "1" });
}
