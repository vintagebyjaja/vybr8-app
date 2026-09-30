/**
 * Active Vybe: activity as context for what to eat, never a calorie trade.
 * Wellness information only. Neutral language (see BANNED_FOOD_WORDS in nutrition.ts).
 */

export type ActivityDay = { day: string; steps: number | null; activeCalories: number | null; distanceM: number | null; activeMinutes: number | null; source: string };
export type DayType = "high_energy" | "rest" | "custom";
export type Range = "day" | "week" | "month";

export const DEFAULT_STEP_GOAL = 10_000;

export const HEALTH_APPS = [
  { key: "apple_health", name: "Apple Health", line: "Steps, workouts, active calories", needs: "phone_app" },
  { key: "health_connect", name: "Health Connect (Android)", line: "Steps & activity from Google Fit, Fitbit and more", needs: "phone_app" },
  { key: "samsung_health", name: "Samsung Health", line: "Activity & nutrition", needs: "phone_app" },
  { key: "garmin", name: "Garmin", line: "Activity, sleep and more", needs: "partner" },
] as const;
export type HealthAppKey = (typeof HEALTH_APPS)[number]["key"];

export const RECOMMENDATIONS = {
  protein: { label: "Higher Protein", tone: "coral" },
  carbs: { label: "Balanced Carbs", tone: "orange" },
  hydration: { label: "Hydration", tone: "sky" },
  nutrient: { label: "Nutrient Dense", tone: "mint" },
  steady: { label: "Steady Energy", tone: "orange" },
  fiber: { label: "Fiber & Greens", tone: "mint" },
} as const;
export type RecKey = keyof typeof RECOMMENDATIONS;

/** Sum rows for the same day from different sources (manual + a synced app): take the highest per field, never double-count. */
export function mergeDay(rows: ActivityDay[]): Omit<ActivityDay, "source"> & { sources: string[] } | null {
  if (!rows.length) return null;
  const max = (k: "steps" | "activeCalories" | "distanceM" | "activeMinutes") => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? Math.max(...v) : null;
  };
  return { day: rows[0]!.day, steps: max("steps"), activeCalories: max("activeCalories"), distanceM: max("distanceM"), activeMinutes: max("activeMinutes"), sources: [...new Set(rows.map((r) => r.source))] };
}

/** Percent more (or less) active than the average of the previous days that have steps. */
export function versusAverage(today: number | null, previous: (number | null)[]): number | null {
  const p = previous.filter((x): x is number => x != null && x > 0);
  if (today == null || p.length < 3) return null;
  const avg = p.reduce((a, b) => a + b, 0) / p.length;
  return Math.round(((today - avg) / avg) * 100);
}

/** What to lean into today, from activity against the person's own goal. */
export function recommendationsFor(steps: number | null, goal: number, activeMinutes: number | null): { dayType: DayType; recs: RecKey[]; line: string } {
  const ratio = steps == null ? null : steps / goal;
  if ((ratio != null && ratio >= 1.1) || (activeMinutes ?? 0) >= 60) {
    return { dayType: "high_energy", recs: ["protein", "carbs", "hydration", "nutrient"], line: "Big day. Refuel with protein and some carbs, and keep the water coming." };
  }
  if (ratio != null && ratio < 0.5) {
    return { dayType: "rest", recs: ["nutrient", "fiber", "hydration", "steady"], line: "Easy day. Nutrient-dense plates and steady energy fit nicely." };
  }
  return { dayType: "custom", recs: ["protein", "steady", "nutrient", "hydration"], line: "Balanced day. Protein at each meal and colorful plates keep you going." };
}

export const milesFrom = (meters: number | null) => (meters == null ? null : Math.round((meters / 1609.344) * 10) / 10);
export const metersFromMiles = (miles: number) => Math.round(miles * 1609.344);

/** Stroke dash for a half-circle gauge (0–1 progress, capped). */
export function gaugeDash(progress: number, radius: number): { length: number; filled: number } {
  const length = Math.PI * radius;
  return { length, filled: Math.max(0, Math.min(1, progress)) * length };
}

/** "2026-09-30" in a timezone, and date math on those strings (no clock drift across servers). */
export function ymdIn(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function isYmd(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}
export function dayLabel(ymd: string): { weekday: string; day: number; long: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
    long: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

export const SLOT_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", pre_workout: "Pre-Workout", snack: "Snack", dinner: "Dinner" };
export function formatClock(t: string): string {
  const [h = "0", m = "00"] = t.split(":");
  const hh = Number(h);
  return `${((hh + 11) % 12) + 1}:${m} ${hh < 12 ? "AM" : "PM"}`;
}
