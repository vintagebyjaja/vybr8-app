import "server-only";
import { addDays, DEFAULT_STEP_GOAL, mergeDay, ymdIn, type ActivityDay, type DayType } from "@/domain/health/health";
import { createClient } from "@/lib/supabase/server";
import { getFeed } from "@/server/posts";

type Row = { day: string; source: string; steps: number | null; active_calories: number | null; distance_m: number | null; active_minutes: number | null };
const toDay = (r: Row): ActivityDay => ({ day: r.day, source: r.source, steps: r.steps, activeCalories: r.active_calories, distanceM: r.distance_m, activeMinutes: r.active_minutes });

export type ActiveVybe = {
  date: string;
  today: ReturnType<typeof mergeDay>;
  goal: number;
  history: { day: string; steps: number | null }[]; // oldest → newest, ending at `date`
  nutrition: { calories: number; protein: number; carbs: number; fat: number; meals: number; target: { calories: number; protein: number | null; carbs: number | null; fat: number | null } | null };
  requested: string[];
};

/** Everything the Active Vybe screen shows for one day. Owner-only rows (RLS). */
export async function getActiveVybe(userId: string, date: string, tz: string, historyDays = 30): Promise<ActiveVybe> {
  const supabase = await createClient();
  const from = addDays(date, -(historyDays - 1));
  const [{ data: rows }, { data: goal }, { data: logs }, { data: targets }, { data: conns }] = await Promise.all([
    supabase.from("activity_days").select("day, source, steps, active_calories, distance_m, active_minutes").eq("user_id", userId).gte("day", from).lte("day", date),
    supabase.from("activity_goals").select("step_goal").eq("user_id", userId).maybeSingle(),
    supabase.from("food_logs").select("calories, protein_g, carbs_g, fat_g, logged_at").eq("user_id", userId)
      .gte("logged_at", `${addDays(date, -1)}T00:00:00Z`).lte("logged_at", `${addDays(date, 1)}T23:59:59Z`),
    supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g").eq("user_id", userId).maybeSingle(),
    supabase.from("health_connections").select("provider, status").eq("user_id", userId),
  ]);

  const byDay = new Map<string, ActivityDay[]>();
  for (const r of (rows ?? []) as Row[]) {
    const list = byDay.get(r.day) ?? [];
    list.push(toDay(r));
    byDay.set(r.day, list);
  }
  const history: { day: string; steps: number | null }[] = [];
  for (let i = historyDays - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    history.push({ day: d, steps: mergeDay(byDay.get(d) ?? [])?.steps ?? null });
  }

  type Log = { calories: number | null; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null; logged_at: string };
  const todays = ((logs ?? []) as Log[]).filter((l) => ymdIn(tz, new Date(l.logged_at)) === date);
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") => Math.round(todays.reduce((a, l) => a + Number(l[k] ?? 0), 0));
  const t = targets as { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;

  return {
    date,
    today: mergeDay(byDay.get(date) ?? []),
    goal: (goal as { step_goal: number } | null)?.step_goal ?? DEFAULT_STEP_GOAL,
    history,
    nutrition: {
      calories: sum("calories"), protein: sum("protein_g"), carbs: sum("carbs_g"), fat: sum("fat_g"), meals: todays.length,
      target: t?.calories ? { calories: t.calories, protein: t.protein_g, carbs: t.carbs_g, fat: t.fat_g } : null,
    },
    requested: ((conns ?? []) as { provider: string; status: string }[]).map((c) => c.provider),
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
