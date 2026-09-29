"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, requireViewer } from "@/server/auth";
import { log } from "@/server/log";

const suggestion = z.object({
  businessId: z.uuid("Pick the place"),
  title: z.string().trim().min(3, "Describe the perk").max(120),
  perkType: z.enum(["free_food", "free_drink", "discount", "other"]),
  window: z.enum(["day", "week", "month"]),
  requirements: z.string().trim().max(300).optional(),
  details: z.string().trim().max(600).optional(),
});

/** Anyone signed in can suggest a perk. The database marks it pending unless they manage that business. */
export async function suggestPerk(form: FormData) {
  const viewer = await requireViewer("/birthday");
  const parsed = suggestion.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/birthday?suggest=invalid#suggest");
  const v = parsed.data;
  if (v.perkType === "free_drink" && !viewer.is21Plus) redirect("/birthday?suggest=invalid#suggest");
  const supabase = await createClient();
  const { error } = await supabase.from("birthday_perks").insert({
    business_id: v.businessId,
    title: v.title,
    perk_type: v.perkType,
    redeem_window: v.window,
    requirements: v.requirements || null,
    details: v.details || null,
    is_alcoholic: v.perkType === "free_drink",
    source: "community",
  });
  if (error) {
    log.warn("perks.suggest_failed", { code: error.code });
    redirect("/birthday?suggest=error#suggest");
  }
  revalidatePath("/birthday");
  redirect("/birthday?suggest=sent#suggest");
}

export async function reviewPerk(form: FormData) {
  await requireStaff();
  const { perkId, decision } = z.object({ perkId: z.uuid(), decision: z.enum(["approve", "reject"]) }).parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_birthday_perk", { p_perk_id: perkId, p_approve: decision === "approve" });
  if (error) log.warn("perks.review_failed", { code: error.code });
  revalidatePath("/birthday");
}
