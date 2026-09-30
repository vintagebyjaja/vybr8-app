"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVITY_LEVELS, ACTIVITY_OPTIONS, STEP_BANDS, isYmd, sleepMinutes, type ActivityLevel, type StepBand } from "@/domain/health/health";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";

const back = (path: string, params: Record<string, string>): never => {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`);
};
const optNum = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).max(max).optional());

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export async function logSleep(form: FormData) {
  const viewer = await requireViewer("/health");
  const date = String(form.get("date") ?? "");
  const p = z.object({
    date: z.string().refine((d) => isYmd(d)),
    bed: time, wake: time,
    quality: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(1).max(5).optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { date, e: "Add when you went to bed and when you woke up." });
  const d = p.data!;
  const minutes = sleepMinutes(d.bed, d.wake);
  if (minutes < 30 || minutes > 1080) back("/health", { date, e: "That's outside 30 minutes to 18 hours. Check the times." });
  const supabase = await createClient();
  const { error } = await supabase.from("sleep_logs").upsert(
    { user_id: viewer.id, day: d.date, bed_time: d.bed, wake_time: d.wake, minutes, quality: d.quality ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,day" },
  );
  if (error) {
    log.warn("health.sleep_failed", { code: error.code });
    back("/health", { date, e: "That didn't save. Try again." });
  }
  revalidatePath("/health");
  revalidatePath("/");
  back("/health", { date: d.date, saved: "sleep" });
}

export async function checkIn(form: FormData) {
  const viewer = await requireViewer("/health");
  const date = String(form.get("date") ?? "");
  const levels = ACTIVITY_LEVELS.map((l) => l.key) as [ActivityLevel, ...ActivityLevel[]];
  const bands = STEP_BANDS.map((b) => b.key) as [StepBand, ...StepBand[]];
  const optionKeys: string[] = ACTIVITY_OPTIONS.map((o) => o.key);
  const p = z.object({
    date: z.string().refine((d) => isYmd(d)),
    level: z.enum(levels),
    band: z.preprocess((v) => (v === "" ? undefined : v), z.enum(bands).optional()),
    miles: optNum(100),
    note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(200).optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { date, e: "Pick how your day went." });
  const d = p.data!;
  const activities = form.getAll("did").map(String).filter((a) => optionKeys.includes(a)).slice(0, 8);
  const supabase = await createClient();
  const { error } = await supabase.from("activity_checkins").upsert(
    { user_id: viewer.id, day: d.date, level: d.level, activities, steps_band: d.band ?? null, miles: d.miles ?? null, note: d.note ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,day" },
  );
  if (error) {
    log.warn("health.checkin_failed", { code: error.code });
    back("/health", { date, e: "That didn't save. Try again." });
  }
  revalidatePath("/health");
  revalidatePath("/");
  back("/health", { date: d.date, saved: "day" });
}

export async function setSleepGoal(form: FormData) {
  const viewer = await requireViewer("/health");
  const p = z.object({ hours: z.coerce.number().min(4).max(12) }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { e: "Pick a sleep goal between 4 and 12 hours." });
  const supabase = await createClient();
  await supabase.from("activity_goals").upsert({ user_id: viewer.id, sleep_goal_minutes: Math.round(p.data!.hours * 60), updated_at: new Date().toISOString() });
  revalidatePath("/health");
  revalidatePath("/");
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
