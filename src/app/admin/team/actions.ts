"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { log } from "@/server/log";

const back = (params: Record<string, string>): never => redirect(`/admin/team?${new URLSearchParams(params)}`);
/** Database messages written for people pass through; anything technical becomes a generic retry. */
const friendly = (m: string) => (/violates|syntax|permission denied|duplicate key|null value|invalid input/i.test(m) ? "That didn't work. Try again." : m);

// The database checks that you're the founder; this re-checks you're an admin first (defense in depth).
export async function setTeamMember(form: FormData) {
  await requireAdmin();
  const p = z.object({
    username: z.string().trim().min(2).max(40),
    role: z.enum(["moderator", "admin"]),
    title: z.string().trim().min(1).max(60),
    bio: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(280).optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back({ e: "Add their username, a role and a title." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_set_member", { p_username: p.data!.username, p_role: p.data!.role, p_title: p.data!.title, p_bio: p.data!.bio ?? null });
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
    role: z.enum(["moderator", "admin"]).default("moderator"),
    title: z.string().trim().max(60).optional(),
    username: z.string().max(40).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back({ e: "Pick a role and a title, then try again." });
  const accept = p.data!.decision === "accept";
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_answer_request", {
    p_ticket: p.data!.ticket, p_accept: accept, p_role: p.data!.role, p_title: p.data!.title || null,
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
