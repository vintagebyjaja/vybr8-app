import "server-only";
import { cache } from "react";
import {
  addDays, blocksFor, clockIn, dayPart, DEFAULT_BED, DEFAULT_SLEEP_GOAL_MIN, DEFAULT_WAKE, mostActive, slotIndex, vybeDay, ymdIn,
  type ActivityLevel, type DayPart, type DayType, type FoodKind, type FoodSlot, type ScheduleBlock, type StepBand,
} from "@/domain/health/health";
import { createClient } from "@/lib/supabase/server";
import { getFeed } from "@/server/posts";

export type SleepLog = { day: string; bedTime: string; wakeTime: string; minutes: number; quality: number | null };
export type CheckIn = { level: ActivityLevel; activities: string[]; stepsBand: StepBand | null; miles: number | null; note: string | null };

export type Rhythm = { wake: string; bed: string; sleepGoal: number; reminders: DayPart[]; blocks: ScheduleBlock[]; set: boolean };

/** When someone usually wakes and sleeps, their reminders and their repeating schedule. Once per request. */
export const getRhythm = cache(async (userId: string): Promise<Rhythm> => {
  const supabase = await createClient();
  const [{ data: g }, { data: rows }] = await Promise.all([
    supabase.from("activity_goals").select("sleep_goal_minutes, usual_wake, usual_bed, reminders").eq("user_id", userId).maybeSingle(),
    supabase.from("vybe_schedule").select("id, label, level, days, start_time, end_time").eq("user_id", userId).order("start_time"),
  ]);
  const goal = g as { sleep_goal_minutes: number; usual_wake: string; usual_bed: string; reminders: DayPart[] } | null;
  type B = { id: string; label: string; level: ActivityLevel; days: number[]; start_time: string; end_time: string };
  return {
    wake: goal?.usual_wake?.slice(0, 5) ?? DEFAULT_WAKE,
    bed: goal?.usual_bed?.slice(0, 5) ?? DEFAULT_BED,
    sleepGoal: goal?.sleep_goal_minutes ?? DEFAULT_SLEEP_GOAL_MIN,
    reminders: goal?.reminders ?? ["morning", "midday", "night"],
    blocks: ((rows ?? []) as B[]).map((b) => ({ id: b.id, label: b.label, level: b.level, days: b.days, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5) })),
    set: !!goal,
  };
});

/** Where the person is in their own day right now: which day it is for them, the part of it, and the wall clock. */
export function nowFor(rhythm: Pick<Rhythm, "wake">, tz: string, d = new Date()) {
  const clock = clockIn(tz, d);
  return { day: vybeDay(clock.ymd, clock.minutes, rhythm.wake), part: dayPart(clock.minutes, rhythm.wake), clock };
}

/** Drop a check-in reminder in Alerts when the current part of their day hasn't been checked in yet. */
export async function remindCheckIn(userId: string, tz: string): Promise<void> {
  const rhythm = await getRhythm(userId);
  if (!rhythm.set) return;   // only people who use Active Vybe
  const now = nowFor(rhythm, tz);
  if (!rhythm.reminders.includes(now.part)) return;
  const supabase = await createClient();
  await supabase.rpc("checkin_reminder", { p_day: now.day, p_part: now.part });
}

export type JournalEntry = {
  id: string; kind: FoodKind; name: string; amount: string | null; ounces: number | null; slot: FoodSlot | null;
  calories: number | null; protein: number | null; fromMenu: boolean; estimated: boolean;
  place: { name: string; slug: string } | null;   // "Ate out?" entries remember where
};

export type ActiveVybe = {
  date: string;
  sleep: SleepLog | null;
  checkin: CheckIn | null;                          // the whole day: check-ins plus the schedule
  checkins: Record<DayPart, CheckIn | null>;       // morning, midday, night
  scheduled: ScheduleBlock[];                      // today's repeating blocks
  sleepGoal: number;
  history: { day: string; sleepMin: number | null; level: ActivityLevel | null }[]; // oldest → newest, ending at `date`
  journal: JournalEntry[];   // in time-of-day order
  waterOz: number;
  nutrition: { calories: number; protein: number; carbs: number; fat: number; meals: number; missing: number; estimated: boolean; target: { calories: number; protein: number | null; carbs: number | null; fat: number | null } | null };
};

/** Everything the Active Vybe screen shows for one day. Owner-only rows (RLS). */
export async function getActiveVybe(userId: string, date: string, tz: string, historyDays = 30): Promise<ActiveVybe> {
  const [supabase, rhythm] = await Promise.all([createClient(), getRhythm(userId)]);
  const from = addDays(date, -(historyDays - 1));
  const logCols = "id, kind, name, amount, ounces, time_slot, day, menu_item_id, calories, protein_g, carbs_g, fat_g, nutrition_source, logged_at, place:businesses ( name, slug )";
  const [{ data: sleeps }, { data: checks }, { data: undated }, { data: targets }, { data: dated }] = await Promise.all([
    supabase.from("sleep_logs").select("day, bed_time, wake_time, minutes, quality").eq("user_id", userId).gte("day", from).lte("day", date),
    supabase.from("activity_checkins").select("day, part, level, activities, steps_band, miles, note, updated_at").eq("user_id", userId).gte("day", from).lte("day", date),
    supabase.from("food_logs").select(logCols).eq("user_id", userId).is("day", null)
      .gte("logged_at", `${addDays(date, -1)}T00:00:00Z`).lte("logged_at", `${addDays(date, 1)}T23:59:59Z`),
    supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g").eq("user_id", userId).maybeSingle(),
    supabase.from("food_logs").select(logCols).eq("user_id", userId).eq("day", date),
  ]);

  type S = { day: string; bed_time: string; wake_time: string; minutes: number; quality: number | null };
  type C = { day: string; part: DayPart; level: ActivityLevel; activities: string[] | null; steps_band: StepBand | null; miles: number | string | null; note: string | null; updated_at: string };
  const sleepBy = new Map(((sleeps ?? []) as S[]).map((r) => [r.day, r] as const));
  const checksBy = new Map<string, C[]>();
  for (const r of (checks ?? []) as C[]) checksBy.set(r.day, [...(checksBy.get(r.day) ?? []), r]);
  const dayLevel = (d: string) => mostActive([...(checksBy.get(d) ?? []).map((c) => c.level), ...blocksFor(rhythm.blocks, d).map((b) => b.level)]);
  const history: ActiveVybe["history"] = [];
  for (let i = historyDays - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    history.push({ day: d, sleepMin: sleepBy.get(d)?.minutes ?? null, level: dayLevel(d) });
  }
  const s = sleepBy.get(date);
  const toCheckIn = (c: C): CheckIn => ({ level: c.level, activities: c.activities ?? [], stepsBand: c.steps_band, miles: c.miles == null ? null : Number(c.miles), note: c.note });
  const todays = checksBy.get(date) ?? [];
  const byPart = (p: DayPart) => { const c = todays.find((x) => x.part === p); return c ? toCheckIn(c) : null; };
  const checkins = { morning: byPart("morning"), midday: byPart("midday"), night: byPart("night") };
  const scheduled = blocksFor(rhythm.blocks, date);
  const BANDS: StepBand[] = ["under_3k", "3k_7k", "7k_12k", "12k_plus"];
  const level = dayLevel(date);
  const miles = todays.reduce<number | null>((a, c) => (c.miles == null ? a : (a ?? 0) + Number(c.miles)), null);
  const band = todays.reduce<StepBand | null>((a, c) => (c.steps_band && (!a || BANDS.indexOf(c.steps_band) > BANDS.indexOf(a)) ? c.steps_band : a), null);
  const latestNote = [...todays].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).find((c) => c.note)?.note ?? null;
  const checkin: CheckIn | null = level
    ? { level, activities: [...new Set(todays.flatMap((c) => c.activities ?? []))], stepsBand: band, miles: miles == null ? null : Math.round(miles * 10) / 10, note: latestNote }
    : null;

  type Log = {
    id: string; kind: FoodKind; name: string; amount: string | null; ounces: number | string | null; time_slot: FoodSlot | null; day: string | null; menu_item_id: string | null;
    calories: number | null; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null; nutrition_source: string | null; logged_at: string;
    place: { name: string; slug: string } | { name: string; slug: string }[] | null;   // Supabase types embeds as arrays
  };
  // Journal rows carry their day; older rows (dish pages, Vybe Plan) count toward the person's day by when they were logged.
  const logsToday = [...((dated ?? []) as unknown as Log[]), ...((undated ?? []) as unknown as Log[]).filter((l) => {
    const c = clockIn(tz, new Date(l.logged_at));
    return vybeDay(c.ymd, c.minutes, rhythm.wake) === date;
  })];
  const journal: JournalEntry[] = logsToday
    .map((l) => ({
      id: l.id, kind: l.kind, name: l.name, amount: l.amount, ounces: l.ounces == null ? null : Number(l.ounces), slot: l.time_slot,
      calories: l.calories, protein: l.protein_g == null ? null : Number(l.protein_g), fromMenu: !!l.menu_item_id, estimated: l.nutrition_source === "estimated", place: (Array.isArray(l.place) ? l.place[0] : l.place) ?? null, at: l.logged_at,
    }))
    .sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot) || a.at.localeCompare(b.at))
    .map(({ at: _at, ...e }) => e);
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => Math.round(logsToday.reduce((a, l) => a + Number(l[k] ?? 0), 0));
  const t = targets as { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;

  return {
    date,
    sleep: s ? { day: s.day, bedTime: s.bed_time.slice(0, 5), wakeTime: s.wake_time.slice(0, 5), minutes: s.minutes, quality: s.quality } : null,
    checkin,
    checkins,
    scheduled,
    sleepGoal: rhythm.sleepGoal,
    history,
    journal,
    waterOz: Math.round(logsToday.filter((l) => l.kind === "water").reduce((a, l) => a + Number(l.ounces ?? 0), 0)),
    nutrition: {
      calories: sum("calories"), protein: sum("protein_g"), carbs: sum("carbs_g"), fat: sum("fat_g"), meals: logsToday.filter((l) => l.kind === "food").length,
      missing: logsToday.filter((l) => l.kind !== "water" && l.calories == null).length,
      estimated: logsToday.some((l) => l.nutrition_source === "estimated"),
      target: t?.calories ? { calories: t.calories, protein: t.protein_g, carbs: t.carbs_g, fat: t.fat_g } : null,
    },
  };
}

export type PlanItem = {
  id: string; slot: string; atTime: string; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null;
  source: string; eaten: boolean; menuItemId: string | null; place: { slug: string; name: string } | null; photo: string | null;
};

/** One day of Your Vybe Plan, with a photo from the latest post of each dish's place when there is one. */
export async function getVybePlan(userId: string, day: string): Promise<{ dayType: DayType; items: PlanItem[] }> {
  const supabase = await createClient();
  const [{ data: items }, { data: dp }] = await Promise.all([
    supabase.from("meal_plan_items")
      .select("id, slot, at_time, name, calories, protein_g, carbs_g, fat_g, nutrition_source, eaten_at, menu_item_id, item:menu_items ( business:businesses ( id, slug, name ) )")
      .eq("user_id", userId).eq("day", day).order("at_time"),
    supabase.from("day_plans").select("day_type").eq("user_id", userId).eq("day", day).maybeSingle(),
  ]);
  type R = {
    id: string; slot: string; at_time: string; name: string; calories: number | null; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null;
    nutrition_source: string; eaten_at: string | null; menu_item_id: string | null; item: { business: { id: string; slug: string; name: string } | null } | null;
  };
  const rows = (items ?? []) as unknown as R[];
  const bizIds = [...new Set(rows.map((r) => r.item?.business?.id).filter((x): x is string => !!x))];
  // Photos come from the latest posts at each place (signed URLs, respecting who can see what).
  const photoBy = new Map<string, string>();
  if (bizIds.length) {
    const feed = await getFeed({ kind: "businesses", businessIds: bizIds });
    for (const p of feed.posts) {
      if (p.business && p.photos[0] && !photoBy.has(p.business.slug)) photoBy.set(p.business.slug, p.photos[0].src);
    }
  }
  const num = (v: number | string | null) => (v == null ? null : Number(v));
  return {
    dayType: ((dp as { day_type: DayType } | null)?.day_type ?? "custom"),
    items: rows.map((r) => ({
      id: r.id, slot: r.slot, atTime: r.at_time, name: r.name, calories: r.calories, protein: num(r.protein_g), carbs: num(r.carbs_g), fat: num(r.fat_g),
      source: r.nutrition_source, eaten: !!r.eaten_at, menuItemId: r.menu_item_id,
      place: r.item?.business ? { slug: r.item.business.slug, name: r.item.business.name } : null,
      photo: r.item?.business ? (photoBy.get(r.item.business.slug) ?? null) : null,
    })),
  };
}
