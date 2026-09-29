"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";
import { log } from "@/server/log";
import { safeNext } from "@/server/safe-redirect";

// Defense in depth: checked here, and again inside each database function.
const decision = z.object({ applicationId: z.uuid(), note: z.string().trim().max(500).optional(), returnTo: z.string().optional() });

export async function approveCreator(form: FormData) {
  const staff = await requireStaff();
  const { applicationId, note, returnTo } = decision.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_creator_application", { p_application_id: applicationId, p_note: note || null });
  if (error) log.warn("team.approve_creator_failed", { applicationId, staffId: staff.id, code: error.code });
  revalidatePath(safeNext(returnTo, "/team/creators"));
  revalidatePath("/explore");
}

export async function confirmProof(form: FormData) {
  const staff = await requireStaff();
  const { applicationId, returnTo } = decision.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_creator_proof", { p_application_id: applicationId });
  if (error) log.warn("team.confirm_proof_failed", { applicationId, staffId: staff.id, code: error.code });
  revalidatePath(safeNext(returnTo, "/team/creators"));
}

export async function rejectCreator(form: FormData) {
  const staff = await requireStaff();
  const { applicationId, note, returnTo } = decision.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_creator_application", { p_application_id: applicationId, p_note: note || "Not a fit for verification right now" });
  if (error) log.warn("team.reject_creator_failed", { applicationId, staffId: staff.id, code: error.code });
  revalidatePath(safeNext(returnTo, "/team/creators"));
}

const statusSchema = z.object({ userId: z.uuid(), status: z.enum(["verified", "suspended"]), note: z.string().trim().max(500).optional() });

export async function setCreatorStatus(form: FormData) {
  const staff = await requireStaff();
  const { userId, status, note } = statusSchema.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_creator_status", { p_user_id: userId, p_status: status, p_note: note || null });
  if (error) log.warn("team.creator_status_failed", { userId, staffId: staff.id, code: error.code });
  revalidatePath("/team/creators");
  revalidatePath("/explore");
}
