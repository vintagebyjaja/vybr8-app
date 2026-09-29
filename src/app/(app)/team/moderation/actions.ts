"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";
import { log } from "@/server/log";

// Checked here and again inside each database function (team_remove / founder_decide).
const removeSchema = z.object({ type: z.enum(["post", "comment", "linkup", "perk"]), id: z.uuid(), reason: z.string().trim().min(3).max(500) });

export async function removeContent(form: FormData) {
  const staff = await requireStaff();
  const parsed = removeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_remove", { p_type: parsed.data.type, p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) log.warn("moderation.remove_failed", { staffId: staff.id, code: error.code });
  revalidatePath("/team/moderation");
}

export async function dismissReports(form: FormData) {
  const staff = await requireStaff();
  const parsed = z.object({ type: z.enum(["post", "comment"]), id: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("reports").update({ status: "dismissed", handled_by: staff.id, handled_at: new Date().toISOString() })
    .eq("target_type", parsed.data.type).eq("target_id", parsed.data.id).eq("status", "open");
  if (error) log.warn("moderation.dismiss_failed", { staffId: staff.id, code: error.code });
  revalidatePath("/team/moderation");
}

export async function founderDecide(form: FormData) {
  const staff = await requireStaff();
  const parsed = z.object({ action: z.uuid(), decision: z.enum(["upheld", "vetoed"]), note: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("founder_decide", { p_action: parsed.data.action, p_decision: parsed.data.decision, p_note: parsed.data.note || null });
  if (error) log.warn("moderation.founder_decide_failed", { staffId: staff.id, code: error.code });
  revalidatePath("/team/moderation");
}
