import "server-only";
import { addDays, DEFAULT_SLEEP_GOAL_MIN, ymdIn, type ActivityLevel, type DayType, type StepBand } from "@/domain/health/health";
import { createClient } from "@/lib/supabase/server";
import { getFeed } from "@/server/posts";

export type SleepLog = { day: string; bedTime: string; wakeTime: string; minutes: number; quality: number | null };
export type CheckIn = { level: ActivityLevel; activities: string[]; stepsBand: StepBand | null; miles: number | null; note: string | null };

export type ActiveVybe = {
  date: string;
  sleep: SleepLog | null;
  checkin: CheckIn | null;
  sleepGoal: number;
  history: { day: string; sleepMin: number | null; level: ActivityLevel | null }[]; // oldest → newest, ending at `date`
  nutrition: { calories: number; protein: number; carbs: number; fat: number; meals: number; target: { calories: number; protein: number | null; carbs: number | null; fat: number | null } | null };
};

/** Everything the Active Vybe screen shows for one day. Owner-only rows (RLS). */
export async function getActiveVybe(userId: string, date: string, tz: string, historyDays = 30): Promise<ActiveVybe> {
  const supabase = await createClient();
  const from = addDays(date, -(historyDays - 1));
  const [{ data: sleeps }, { data: checks }, { data: goal }, { data: logs }, { data: targets }] = await Promise.all([
    supabase.from("sleep_logs").select("day, bed_time, wake_time, minutes, quality").eq("user_id", userId).gte("day", from).lte("day", date),
    supabase.from("activity_checkins").select("day, level, activities, steps_band, miles, note").eq("user_id", userId).gte("day", from).lte("day", date),
    supabase.from("activity_goals").select("sleep_goal_minutes").eq("user_id", userId).maybeSingle(),
    supabase.from("food_logs").select("calories, protein_g, carbs_g, fat_g, logged_at").eq("user_id", userId)
      .gte("logged_at", `${addDays(date, -1)}T00:00:00Z`).lte("logged_at", `${addDays(date, 1)}T23:59:59Z`),
    supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g").eq("user_id", userId).maybeSingle(),
  ]);

  type S = { day: string; bed_time: string; wake_time: string; minutes: number; quality: number | null };
  type C = { day: string; level: ActivityLevel; activities: string[] | null; steps_band: StepBand | null; miles: number | string | null; note: string | null };
  const sleepBy = new Map(((sleeps ?? []) as S[]).map((r) => [r.day, r] as const));
  const checkBy = new Map(((checks ?? []) as C[]).map((r) => [r.day, r] as const));
  const history: ActiveVybe["history"] = [];
  for (let i = historyDays - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    history.push({ day: d, sleepMin: sleepBy.get(d)?.minutes ?? null, level: checkBy.get(d)?.level ?? null });
  }
  const s = sleepBy.get(date);
  const c = checkBy.get(date);

  type Log = { calories: number | null; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null; logged_at: string };
  const todays = ((logs ?? []) as Log[]).filter((l) => ymdIn(tz, new Date(l.logged_at)) === date);
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => Math.round(todays.reduce((a, l) => a + Number(l[k] ?? 0), 0));
  const t = targets as { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;

  return {
    date,
    sleep: s ? { day: s.day, bedTime: s.bed_time.slice(0, 5), wakeTime: s.wake_time.slice(0, 5), minutes: s.minutes, quality: s.quality } : null,
    checkin: c ? { level: c.level, activities: c.activities ?? [], stepsBand: c.steps_band, miles: c.miles == null ? null : Number(c.miles), note: c.note } : null,
    sleepGoal: (goal as { sleep_goal_minutes: number } | null)?.sleep_goal_minutes ?? DEFAULT_SLEEP_GOAL_MIN,
    history,
    nutrition: {
      calories: sum("calories"), protein: sum("protein_g"), carbs: sum("carbs_g"), fat: sum("fat_g"), meals: todays.length,
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
