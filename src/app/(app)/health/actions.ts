"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { HEALTH_APPS, isYmd, metersFromMiles } from "@/domain/health/health";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";

const back = (path: string, params: Record<string, string>): never => {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`);
};
const optInt = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(String(v).replace(/,/g, ""))), z.number().int().min(0).max(max).optional());
const optNum = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).max(max).optional());

export async function logActivity(form: FormData) {
  const viewer = await requireViewer("/health");
  const p = z.object({
    date: z.string().refine((d) => isYmd(d)),
    steps: optInt(150000), calories: optInt(10000), miles: optNum(180), minutes: optInt(1440),
  }).safeParse(Object.fromEntries(form));
  const date = typeof form.get("date") === "string" ? String(form.get("date")) : "";
  if (!p.success) back("/health", { date, e: "Check the numbers and try again." });
  const d = p.data!;
  const supabase = await createClient();
  const { error } = await supabase.from("activity_days").upsert({
    user_id: viewer.id, day: d.date, source: "manual",
    steps: d.steps ?? null, active_calories: d.calories ?? null, distance_m: d.miles != null ? metersFromMiles(d.miles) : null, active_minutes: d.minutes ?? null,
  }, { onConflict: "user_id,day,source" });
  if (error) {
    log.warn("health.log_failed", { code: error.code });
    back("/health", { date: d.date, e: "That didn't save. Try again." });
  }
  revalidatePath("/health");
  revalidatePath("/");
  back("/health", { date: d.date, saved: "1" });
}

export async function setStepGoal(form: FormData) {
  const viewer = await requireViewer("/health");
  const p = z.object({ goal: z.coerce.number().int().min(1000).max(50000) }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { e: "Pick a goal between 1,000 and 50,000 steps." });
  const supabase = await createClient();
  await supabase.from("activity_goals").upsert({ user_id: viewer.id, step_goal: p.data!.goal, updated_at: new Date().toISOString() });
  revalidatePath("/health");
  revalidatePath("/");
}

export async function requestHealthApp(form: FormData) {
  const viewer = await requireViewer("/health");
  const provider = String(form.get("provider") ?? "");
  if (!HEALTH_APPS.some((a) => a.key === provider)) return;
  const supabase = await createClient();
  await supabase.from("health_connections").upsert({ user_id: viewer.id, provider }, { onConflict: "user_id,provider", ignoreDuplicates: true });
  revalidatePath("/health");
}

// ── Your Vybe Plan ─────────────────────────────────────────────────────
export async function suggestPlan(form: FormData) {
  await requireViewer("/health/plan");
  const p = z.object({ day: z.string().refine((d) => isYmd(d)), type: z.enum(["high_energy", "rest", "custom"]), city: z.string().regex(/^[a-z0-9-]{2,40}$/) })
    .safeParse(Object.fromEntries(form));
  if (!p.success) back("/health/plan", { e: "Pick a day." });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_meal_plan", { p_city: p.data!.city, p_day: p.data!.day, p_day_type: p.data!.type });
  if (error) back("/health/plan", { day: p.data!.day, e: /MAX|two weeks/.test(error.message) ? error.message : "Couldn't build a plan right now." });
  if (data === 0) back("/health/plan", { day: p.data!.day, e: "No dishes with nutrition info near you yet. As places add theirs, your plan fills in." });
  revalidatePath("/health/plan");
  back("/health/plan", { day: p.data!.day });
}

export async function eatMeal(form: FormData) {
  await requireViewer("/health/plan");
  const id = z.uuid().safeParse(form.get("id"));
  const day = String(form.get("day") ?? "");
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("eat_planned_meal", { p_item: id.data });
  revalidatePath("/health/plan");
  revalidatePath("/health");
  back("/health/plan", { day });
}

export async function removeMeal(form: FormData) {
  await requireViewer("/health/plan");
  const id = z.uuid().safeParse(form.get("id"));
  const day = String(form.get("day") ?? "");
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("meal_plan_items").delete().eq("id", id.data);
  revalidatePath("/health/plan");
  back("/health/plan", { day });
}
