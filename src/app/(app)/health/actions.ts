"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVITY_LEVELS, ACTIVITY_OPTIONS, DAY_PARTS, FOOD_KINDS, FOOD_SLOTS, STEP_BANDS, isYmd, sleepMinutes, type ActivityLevel, type DayPart, type FoodKind, type FoodSlot, type StepBand } from "@/domain/health/health";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";
import { FAILURE_HELP, estimateNutritionDetailed, type EstimateFailure } from "@/server/nutrition-ai";

const back = (path: string, params: Record<string, string>): never => {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`);
};
const optNum = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).max(max).optional());

const levels = ACTIVITY_LEVELS.map((l) => l.key) as [ActivityLevel, ...ActivityLevel[]];
const parts = DAY_PARTS.map((x) => x.key) as [DayPart, ...DayPart[]];

/** Start Active Vybe for this person (default rhythm, all reminders on) the first time they log anything. */
async function ensureGoals(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  await supabase.from("activity_goals").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
}

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
  await ensureGoals(supabase, viewer.id);
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
  const bands = STEP_BANDS.map((b) => b.key) as [StepBand, ...StepBand[]];
  const optionKeys: string[] = ACTIVITY_OPTIONS.map((o) => o.key);
  const p = z.object({
    date: z.string().refine((d) => isYmd(d)),
    part: z.enum(parts).default("midday"),
    level: z.enum(levels),
    band: z.preprocess((v) => (v === "" ? undefined : v), z.enum(bands).optional()),
    miles: optNum(100),
    note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(200).optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { date, e: "Pick how your day went." });
  const d = p.data!;
  const activities = form.getAll("did").map(String).filter((a) => optionKeys.includes(a)).slice(0, 8);
  const supabase = await createClient();
  await ensureGoals(supabase, viewer.id);
  const { error } = await supabase.from("activity_checkins").upsert(
    { user_id: viewer.id, day: d.date, part: d.part, level: d.level, activities, steps_band: d.band ?? null, miles: d.miles ?? null, note: d.note ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,day,part" },
  );
  if (error) {
    log.warn("health.checkin_failed", { code: error.code });
    back("/health", { date, e: "That didn't save. Try again." });
  }
  // The reminder for this part is done: clear it from Alerts.
  await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", viewer.id).eq("dedupe_key", `health.checkin.${d.date}.${d.part}`).is("read_at", null);
  revalidatePath("/health");
  revalidatePath("/");
  back("/health", { date: d.date, part: d.part, saved: "day" });
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

// ── My Vybe Schedule ─────────────────────────────────────────────────
export async function saveRhythm(form: FormData) {
  const viewer = await requireViewer("/health/schedule");
  const p = z.object({ wake: time, bed: time, hours: z.coerce.number().min(4).max(12) }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health/schedule", { e: "Add when you usually wake up and go to bed." });
  const reminders = form.getAll("remind").map(String).filter((r): r is DayPart => (parts as string[]).includes(r));
  const supabase = await createClient();
  const { error } = await supabase.from("activity_goals").upsert({
    user_id: viewer.id, usual_wake: p.data!.wake, usual_bed: p.data!.bed, sleep_goal_minutes: Math.round(p.data!.hours * 60), reminders, updated_at: new Date().toISOString(),
  });
  if (error) {
    log.warn("health.rhythm_failed", { code: error.code });
    back("/health/schedule", { e: "That didn't save. Try again." });
  }
  revalidatePath("/health", "layout");
  revalidatePath("/");
  back("/health/schedule", { saved: "rhythm" });
}

export async function addBlock(form: FormData) {
  const viewer = await requireViewer("/health/schedule");
  const p = z.object({ label: z.string().trim().min(1).max(40), level: z.enum(levels), start: time, end: time }).safeParse(Object.fromEntries(form));
  const days = [...new Set(form.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  if (!p.success || !days.length) back("/health/schedule", { e: "Name it, pick the days, and add a start and end time." });
  if (p.data!.start === p.data!.end) back("/health/schedule", { e: "The start and end time can't be the same." });
  const supabase = await createClient();
  await ensureGoals(supabase, viewer.id);
  const { error } = await supabase.from("vybe_schedule").insert({ user_id: viewer.id, label: p.data!.label, level: p.data!.level, days, start_time: p.data!.start, end_time: p.data!.end });
  if (error) {
    log.warn("health.block_failed", { code: error.code });
    back("/health/schedule", { e: error.message.includes("20 schedule") ? "You can have up to 20 schedule blocks." : "That didn't save. Try again." });
  }
  revalidatePath("/health", "layout");
  back("/health/schedule", { saved: "block" });
}

export async function removeBlock(form: FormData) {
  await requireViewer("/health/schedule");
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("vybe_schedule").delete().eq("id", id.data);   // owner-only by RLS
  revalidatePath("/health", "layout");
  back("/health/schedule", {});
}

// ── "Have you already ate?" journal ────────────────────────────────────
const slots = FOOD_SLOTS.map((x) => x.key) as [FoodSlot, ...FoodSlot[]];
const kinds = FOOD_KINDS.map((x) => x.key) as [FoodKind, ...FoodKind[]];
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export async function logFood(form: FormData) {
  const viewer = await requireViewer("/health");
  const date = String(form.get("date") ?? "");
  const p = z.object({
    date: z.string().refine((d) => isYmd(d)),
    kind: z.enum(kinds),
    slot: z.enum(slots),
    name: z.preprocess(blank, z.string().trim().min(1).max(120).optional()),
    amount: z.preprocess(blank, z.string().trim().max(40).optional()),
    ounces: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().gt(0).max(200).optional()),
    calories: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(5000).optional()),
    protein: optNum(500),
    place: z.preprocess(blank, z.uuid().optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { date, e: "Pick food, drink or water, what time of day, and what it was." });
  const d = p.data!;
  const name = d.kind === "water" ? (d.name ?? "Water") : d.name;
  if (!name) back("/health", { date, e: d.kind === "drink" ? "What did you drink?" : "What did you eat?" });
  if (d.kind === "water" && !d.ounces) back("/health", { date, e: "How many ounces of water?" });
  const supabase = await createClient();
  await ensureGoals(supabase, viewer.id);
  const placeName = d.place ? await placeNameFor(supabase, d.place) : null;
  // No calories typed in? VYBR8 estimates them (always labeled as an estimate).
  const est = d.kind !== "water" && d.calories == null && (await underEstimateCap(supabase, viewer.id, d.date))
    ? (await estimateNutritionDetailed({ kind: d.kind, name: name!, amount: d.amount, ounces: d.ounces, place: placeName })).estimate
    : null;
  const { error } = await supabase.from("food_logs").insert({
    user_id: viewer.id, day: d.date, kind: d.kind, time_slot: d.slot, name, amount: d.kind === "water" ? null : (d.amount ?? null),
    business_id: placeName ? d.place : null,
    ounces: d.ounces ?? null,
    calories: d.kind === "water" ? 0 : (d.calories ?? est?.calories ?? null),
    protein_g: d.protein ?? est?.protein ?? null, carbs_g: est?.carbs ?? null, fat_g: est?.fat ?? null,
    nutrition_source: est ? "estimated" : "unknown",
  });
  if (error) {
    log.warn("health.food_failed", { code: error.code });
    back("/health", { date, e: "That didn't save. Try again." });
  }
  revalidatePath("/health");
  back("/health", { date: d.date, saved: d.kind });
}

async function placeNameFor(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<string | null> {
  const { data } = await supabase.from("businesses").select("name").eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

/** What members see when an estimate fails; the founder and admins also see why, so it can be fixed. */
function estimateError(viewer: { platformRoles: string[] }, failure: EstimateFailure | null): string {
  const base = "Couldn't estimate that one. Add the calories yourself if you know them.";
  return viewer.platformRoles.includes("admin") && failure ? `${base} (Admin: ${FAILURE_HELP[failure]})` : base;
}

/** "Ate out?" Log a dish straight from a restaurant's VYBR8 menu. */
export async function logFromMenu(form: FormData) {
  const viewer = await requireViewer("/health");
  const p = z.object({
    item: z.uuid(),
    date: z.string().refine((d) => isYmd(d)),
    slot: z.enum(slots),
    portion: z.preprocess((v) => (v == null || v === "" ? 1 : Number(v)), z.number().min(0.25).max(3)),
    back: z.string().regex(/^\/health\/ate-out\?[\w=&%.+-]*$/),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) back("/health", { e: "Pick when you had it, then tap the dish." });
  const d = p.data!;
  const supabase = await createClient();
  const { data: row } = await supabase.from("menu_items").select("id, name, category, business_id, business:businesses ( name )").eq("id", d.item).maybeSingle();
  const item = row as unknown as { id: string; name: string; category: "food" | "drink"; business_id: string; business: { name: string } | null } | null;
  if (!item) back(d.back, { e: "That dish isn't on the menu anymore." });
  await ensureGoals(supabase, viewer.id);
  const { data: cal } = await supabase.rpc("menu_calories", { p_business: item!.business_id });
  const known = ((cal ?? []) as { menu_item_id: string; calories: number; source: string }[]).find((c) => c.menu_item_id === item!.id);
  const est = known ? null
    : (await underEstimateCap(supabase, viewer.id, d.date))
      ? (await estimateNutritionDetailed({ kind: item!.category, name: item!.name, place: item!.business?.name ?? null })).estimate
      : null;
  const scale = (n: number | null | undefined) => (n == null ? null : Math.round(n * d.portion * 10) / 10);
  const { error } = await supabase.from("food_logs").insert({
    user_id: viewer.id, day: d.date, kind: item!.category, time_slot: d.slot, name: item!.name.slice(0, 120),
    amount: d.portion === 1 ? null : d.portion === 0.5 ? "half (split it)" : `${d.portion}×`,
    portion: d.portion, menu_item_id: item!.id, business_id: item!.business_id,
    calories: known ? Math.round(known.calories * d.portion) : est ? Math.round(est.calories * d.portion) : null,
    protein_g: known ? null : scale(est?.protein), carbs_g: known ? null : scale(est?.carbs), fat_g: known ? null : scale(est?.fat),
    nutrition_source: known ? known.source : est ? "estimated" : "unknown",
  });
  if (error) {
    log.warn("health.menu_log_failed", { code: error.code });
    back(d.back, { e: "That didn't save. Try again." });
  }
  revalidatePath("/health");
  back(d.back, { added: item!.name.slice(0, 60) });
}

/** Up to 40 AI estimates per person per day keeps costs predictable. */
async function underEstimateCap(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, day: string): Promise<boolean> {
  const { count } = await supabase.from("food_logs").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("day", day).eq("nutrition_source", "estimated");
  return (count ?? 0) < 40;
}

/** Estimate calories for something already logged without them. */
export async function estimateFood(form: FormData) {
  const viewer = await requireViewer("/health");
  const id = z.uuid().safeParse(form.get("id"));
  const date = String(form.get("date") ?? "");
  if (!id.success) return;
  const supabase = await createClient();
  const { data: row } = await supabase.from("food_logs").select("kind, name, amount, ounces, calories, place:businesses ( name )").eq("id", id.data).maybeSingle();
  const r = row as unknown as { kind: string; name: string; amount: string | null; ounces: number | string | null; calories: number | null; place: { name: string } | null } | null;
  if (!r || r.kind === "water" || r.calories != null) back("/health", isYmd(date) ? { date } : {});
  const res = (await underEstimateCap(supabase, viewer.id, date))
    ? await estimateNutritionDetailed({ kind: r!.kind === "drink" ? "drink" : "food", name: r!.name, amount: r!.amount, ounces: r!.ounces == null ? null : Number(r!.ounces), place: r!.place?.name ?? null })
    : null;
  if (!res?.estimate) back("/health", { ...(isYmd(date) ? { date } : {}), e: res ? estimateError(viewer, res.failure) : "That's a lot of estimates today. Add calories yourself for the rest." });
  const est = res!.estimate!;
  await supabase.from("food_logs").update({ calories: est.calories, protein_g: est.protein, carbs_g: est.carbs, fat_g: est.fat, nutrition_source: "estimated" }).eq("id", id.data);
  revalidatePath("/health");
  back("/health", isYmd(date) ? { date, saved: "estimate" } : { saved: "estimate" });
}

export async function removeFood(form: FormData) {
  await requireViewer("/health");
  const id = z.uuid().safeParse(form.get("id"));
  const date = String(form.get("date") ?? "");
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("food_logs").delete().eq("id", id.data);   // owner-only by RLS
  revalidatePath("/health");
  back("/health", isYmd(date) ? { date } : {});
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
