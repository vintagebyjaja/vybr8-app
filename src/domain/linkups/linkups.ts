/**
 * Link Ups: group outings with 2–10 spots. Rules shared by the form and the server;
 * the database enforces them again.
 */

export const MIN_SPOTS = 2;
export const MAX_SPOTS = 10;
export const MAX_HOURS = 24;
export const MAX_DAYS_AHEAD = 90;

export const OCCASIONS = {
  girls_night: "Girls night out",
  guys_night: "Guys night out",
  dinner: "Dinner",
  drinks: "Drinks",
  brunch: "Brunch",
  happy_hour: "Happy hour",
  birthday: "Birthday",
  date_night: "Date night",
  game_night: "Game night",
  meet_new_friends: "Meet new friends",
  other: "Something else",
} as const;
export type Occasion = keyof typeof OCCASIONS;

/** Occasions that usually involve alcohol default to "Drinks involved (21+)". */
export const DRINKS_BY_DEFAULT: readonly Occasion[] = ["drinks", "happy_hour"];

export type LinkupDraft = {
  title: string;
  occasion: string;
  citySlug: string;
  businessId?: string | null;
  meetPoint?: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  visibility: string;
  joinMode: string;
  isAlcoholic: boolean;
  description?: string | null;
};

export function validateLinkupDraft(d: LinkupDraft, opts: { now: Date; hostIs21OnDay: boolean; cities: readonly string[] }): string[] {
  const errors: string[] = [];
  const title = d.title.trim();
  if (title.length < 3 || title.length > 80) errors.push("Give your Link Up a name (3–80 characters).");
  if (!(d.occasion in OCCASIONS)) errors.push("Pick what kind of Link Up this is.");
  if (!opts.cities.includes(d.citySlug)) errors.push("Pick one of the VYBR8 cities.");
  if (!d.businessId && !(d.meetPoint ?? "").trim()) errors.push("Pick a place or say where to meet.");
  if (!Number.isFinite(d.startsAt.getTime()) || !Number.isFinite(d.endsAt.getTime())) errors.push("Pick a start and end time.");
  else {
    if (d.startsAt.getTime() < opts.now.getTime() - 10 * 60_000) errors.push("The start time has already passed.");
    if (d.startsAt.getTime() > opts.now.getTime() + MAX_DAYS_AHEAD * 86_400_000) errors.push(`Plan up to ${MAX_DAYS_AHEAD} days ahead.`);
    if (d.endsAt <= d.startsAt) errors.push("The end time must be after the start.");
    else if (d.endsAt.getTime() - d.startsAt.getTime() > MAX_HOURS * 3_600_000) errors.push("A Link Up can last up to 24 hours.");
  }
  if (!Number.isInteger(d.capacity) || d.capacity < MIN_SPOTS || d.capacity > MAX_SPOTS) errors.push(`Choose ${MIN_SPOTS}–${MAX_SPOTS} spots (you count as one).`);
  if (!["public", "friends", "invite_only"].includes(d.visibility)) errors.push("Choose who can see it.");
  if (!["open", "request"].includes(d.joinMode)) errors.push("Choose how people join.");
  if (d.isAlcoholic && !opts.hostIs21OnDay) errors.push("Drinks Link Ups must start on or after your 21st birthday.");
  if ((d.description ?? "").length > 1000) errors.push("Keep the details under 1,000 characters.");
  return errors;
}

export function spotsLeft(capacity: number, taken: number): number {
  return Math.max(0, capacity - taken);
}

/**
 * Convert a wall-clock time typed in a city ("2026-10-02T19:00") to a real instant,
 * using that city's time zone (handles daylight saving).
 */
export function cityTimeToDate(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return new Date(Number.NaN);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (instant: number) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(instant));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - instant;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

/** "Fri, Oct 2 · 7:00 PM" in the city's time zone. */
export function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date).replace(",", "").replace(/, (?=\d{1,2}:)/, " · ");
}

/** The calendar day ("YYYY-MM-DD") an instant falls on in a city. */
export function cityDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Is someone born on `birth` ("YYYY-MM-DD") 21 on `day` ("YYYY-MM-DD")? Drinks Link Ups are judged on the event day. */
export function is21OnDay(birth: string, day: string): boolean {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age >= 21;
}
