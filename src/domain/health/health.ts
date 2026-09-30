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

// ── Sleep & activity check-ins (no health apps needed) ────────────────

export const DEFAULT_SLEEP_GOAL_MIN = 480;

export const ACTIVITY_LEVELS = [
  { key: "very_active", label: "Very active", line: "Workout, sports, long walk or run", tone: "coral" },
  { key: "active", label: "Active", line: "On my feet a lot, walked around", tone: "orange" },
  { key: "light", label: "Light", line: "Some walking, mostly easy", tone: "sky" },
  { key: "sitting", label: "Mostly sitting", line: "Desk, driving, classes", tone: "lavender" },
  { key: "gaming", label: "Gaming / screens", line: "Games, TV, scrolling", tone: "lavender" },
  { key: "rest", label: "Rest day", line: "Recovering, sick or lazy on purpose", tone: "mint" },
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]["key"];

export const ACTIVITY_OPTIONS = [
  { key: "walk", label: "Walked" }, { key: "gym", label: "Gym" }, { key: "run", label: "Ran" }, { key: "sports", label: "Played sports" },
  { key: "dance", label: "Danced / went out" }, { key: "on_feet_work", label: "Worked on my feet" }, { key: "chores", label: "Chores / errands" },
  { key: "desk_work", label: "Desk work / school" }, { key: "gaming", label: "Gaming" }, { key: "tv", label: "TV / movies" }, { key: "driving", label: "Driving" },
] as const;

export const STEP_BANDS = [
  { key: "under_3k", label: "Under 3,000 steps" },
  { key: "3k_7k", label: "3,000 – 7,000" },
  { key: "7k_12k", label: "7,000 – 12,000" },
  { key: "12k_plus", label: "12,000+" },
] as const;
export type StepBand = (typeof STEP_BANDS)[number]["key"];

/** Minutes asleep from "HH:MM" bedtime to "HH:MM" wake time, crossing midnight when needed. */
export function sleepMinutes(bed: string, wake: string): number {
  const toMin = (t: string) => {
    const [h = "0", m = "0"] = t.split(":");
    return Number(h) * 60 + Number(m);
  };
  let d = toMin(wake) - toMin(bed);
  if (d <= 0) d += 24 * 60;
  return d;
}

export function formatDuration(min: number | null): string {
  if (min == null) return "–";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const QUALITY_LABEL: Record<number, string> = { 1: "Exhausted", 2: "Tired", 3: "Okay", 4: "Rested", 5: "Great" };

/** How active the day was, as a 0–3 score, from the check-in (steps band or miles override the level when given). */
export function activityScore(level: ActivityLevel | null, band: StepBand | null, miles: number | null): number | null {
  if (miles != null && miles > 0) return miles >= 6 ? 3 : miles >= 3 ? 2 : miles >= 1 ? 1 : 0;
  if (band) return { under_3k: 0, "3k_7k": 1, "7k_12k": 2, "12k_plus": 3 }[band];
  if (!level) return null;
  return { very_active: 3, active: 2, light: 1, sitting: 0, gaming: 0, rest: 0 }[level];
}

/** Today's suggestions from sleep and activity. Neutral, practical, never a calorie trade. */
export function dayAdvice(input: { sleepMin: number | null; sleepGoal: number; quality: number | null; level: ActivityLevel | null; score: number | null }): { dayType: DayType; recs: RecKey[]; line: string; sleepLine: string | null } {
  const { sleepMin, sleepGoal, quality, level, score } = input;
  const short = sleepMin != null && (sleepMin < sleepGoal - 60 || (quality != null && quality <= 2));
  const rested = sleepMin != null && sleepMin >= sleepGoal - 30 && (quality == null || quality >= 3);
  const sleepLine = sleepMin == null ? null
    : short ? "Short night. Steady meals, protein and water help more than extra sugar or caffeine late in the day. Aim to wind down a little earlier tonight."
    : rested ? "You're rested. Good day to go for that workout or a long walk to your next spot."
    : "Close to your sleep goal. Keep bedtime steady tonight.";

  if ((score ?? 0) >= 2 || level === "very_active") {
    return { dayType: "high_energy", recs: ["protein", "carbs", "hydration", "nutrient"], line: "Big day. Refuel with protein and some carbs, and keep the water coming.", sleepLine };
  }
  if (short) {
    return { dayType: "custom", recs: ["steady", "protein", "hydration", "fiber"], line: "Tired day. Steady energy beats a sugar crash: protein, fiber and water.", sleepLine };
  }
  if (level === "gaming" || level === "sitting" || level === "rest") {
    return { dayType: "rest", recs: ["nutrient", "fiber", "hydration", "steady"], line: level === "gaming" ? "Screen day. Keep snacks lighter, drink water, and stretch between sessions." : "Easier day. Nutrient-dense plates and steady energy fit nicely.", sleepLine };
  }
  return { dayType: "custom", recs: ["protein", "steady", "nutrient", "hydration"], line: "Balanced day. Protein at each meal and colorful plates keep you going.", sleepLine };
}

// ── "Have you already ate?" food & drink journal ─────────────────────────
export const FOOD_SLOTS = [
  { key: "early_morning", label: "Early morning" },
  { key: "before_work", label: "Before work" },
  { key: "morning", label: "Morning" },
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "happy_hour", label: "Happy hour" },
  { key: "dinner", label: "Dinner" },
  { key: "late_night_snack", label: "Late night snack" },
  { key: "midnight_munch", label: "Midnight munch" },
] as const;
export type FoodSlot = (typeof FOOD_SLOTS)[number]["key"];
export const FOOD_KINDS = [
  { key: "food", label: "Food" },
  { key: "drink", label: "Drink" },
  { key: "water", label: "Water" },
] as const;
export type FoodKind = (typeof FOOD_KINDS)[number]["key"];

/** The time of day that fits an hour (0–23), used to preselect a slot. */
export function slotForHour(hour: number): FoodSlot {
  if (hour < 4) return "midnight_munch";
  if (hour < 6) return "early_morning";
  if (hour < 8) return "before_work";
  if (hour < 10) return "breakfast";
  if (hour < 11) return "morning";
  if (hour < 15) return "lunch";
  if (hour < 18) return "happy_hour";
  if (hour < 21) return "dinner";
  return "late_night_snack";
}

/** Current hour (0–23) in a time zone. */
export function hourIn(tz: string, d = new Date()): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
  return Number.isFinite(h) ? h % 24 : 12;
}

/** Sort position of a slot (unknown slots go last). */
export function slotIndex(slot: string | null): number {
  const i = FOOD_SLOTS.findIndex((s) => s.key === slot);
  return i === -1 ? FOOD_SLOTS.length : i;
}

// ── Your rhythm: the Health tab follows the person's day, not the wall clock ──
// Everything is worked out on a "body clock": the hour it would be if they woke at 7 AM.
// A night-shift worker who wakes at 3 PM is in their "morning" at 4 PM, and 2 AM still counts as their day.

export type DayPart = "morning" | "midday" | "night";
export const DAY_PARTS: { key: DayPart; label: string; greeting: string; prompt: string }[] = [
  { key: "morning", label: "Morning", greeting: "Good Morning, Let's Vybe", prompt: "How'd you sleep, and what's the plan today?" },
  { key: "midday", label: "Midday", greeting: "How's the Vybe Going?", prompt: "What have you been up to?" },
  { key: "night", label: "Night", greeting: "Time to Let the Vybes Rest", prompt: "How was the rest of your day?" },
];
export const DEFAULT_WAKE = "07:00";
export const DEFAULT_BED = "23:00";

export const toMinutes = (t: string): number => {
  const [h = "0", m = "0"] = t.split(":");
  return (Number(h) * 60 + Number(m)) % 1440;
};

/** Local date (YYYY-MM-DD) and minutes since midnight in a time zone. */
export function clockIn(tz: string, d = new Date()): { ymd: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const ymd = ymdIn(tz, d);
  return { ymd, minutes: (get("hour") % 24) * 60 + get("minute"), weekday: weekdayOf(ymd) };
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD date. */
export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/** The hour (0–23) on the person's body clock: waking up is always 7. */
export function bodyHour(clockMinutes: number, wake: string = DEFAULT_WAKE): number {
  return Math.floor((((clockMinutes - toMinutes(wake) + 7 * 60) % 1440) + 1440) % 1440 / 60);
}

/** The day someone is living right now: it starts 3 hours before they usually wake up. */
export function vybeDay(calendarYmd: string, clockMinutes: number, wake: string = DEFAULT_WAKE): string {
  const offset = toMinutes(wake) - 180;
  return addDays(calendarYmd, Math.floor((clockMinutes - offset) / 1440));
}

/** Morning for the first hours after waking, midday through the afternoon, night after that. */
export function dayPart(clockMinutes: number, wake: string = DEFAULT_WAKE): DayPart {
  const h = bodyHour(clockMinutes, wake);
  if (h >= 4 && h < 11) return "morning";
  if (h >= 11 && h < 18) return "midday";
  return "night";
}

export type ScheduleBlock = { id: string; label: string; level: ActivityLevel; days: number[]; start: string; end: string };

/** Blocks on the schedule for a day (by weekday). */
export function blocksFor(blocks: ScheduleBlock[], ymd: string): ScheduleBlock[] {
  const wd = weekdayOf(ymd);
  return blocks.filter((b) => b.days.includes(wd)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** The block happening at a clock time on a weekday (handles overnight blocks that started the day before). */
export function blockAt(blocks: ScheduleBlock[], weekday: number, clockMinutes: number): ScheduleBlock | null {
  for (const b of blocks) {
    const s = toMinutes(b.start);
    const e = toMinutes(b.end);
    if (s < e) { if (b.days.includes(weekday) && clockMinutes >= s && clockMinutes < e) return b; }
    else if ((b.days.includes(weekday) && clockMinutes >= s) || (b.days.includes((weekday + 6) % 7) && clockMinutes < e)) return b;
  }
  return null;
}

/** The most active level among check-ins and the day's schedule (a desk day plus a gym night is an active day). */
export function mostActive(levels: (ActivityLevel | null | undefined)[]): ActivityLevel | null {
  let best: number | null = null;
  for (const l of levels) {
    const i = ACTIVITY_LEVELS.findIndex((x) => x.key === l);
    if (i !== -1 && (best == null || i < best)) best = i;
  }
  return best == null ? null : ACTIVITY_LEVELS[best]!.key;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "Mon–Fri", "Weekends", "Every day" or "Mon, Wed, Fri". */
export function daysLabel(days: number[]): string {
  const s = [...new Set(days)].sort((a, b) => a - b);
  if (s.length === 7) return "Every day";
  if (s.join() === "1,2,3,4,5") return "Mon–Fri";
  if (s.join() === "0,6") return "Weekends";
  const run = s.length > 2 && s.every((d, i) => i === 0 || d === s[i - 1]! + 1);
  return run ? `${WEEKDAYS[s[0]!]}–${WEEKDAYS[s[s.length - 1]!]}` : s.map((d) => WEEKDAYS[d]).join(", ");
}

/** Minutes since midnight → "HH:MM". */
export const hhmm = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
