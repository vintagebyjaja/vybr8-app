/**
 * Birthday rules. Dates are plain calendar days ("YYYY-MM-DD"), never timestamps,
 * so a birthday never shifts because of time zones. Mirrors private.next_birthday in SQL.
 */

/** Minimum age to use VYBR8 (US social apps: 13+, COPPA). */
export const MIN_AGE = 13;
/** Alcohol content, drink perks and Liquid Lover verification. */
export const DRINKING_AGE = 21;

export type Ymd = { y: number; m: number; d: number };

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(s: string): Ymd | null {
  const match = YMD.exec(s);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const toYmdString = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

const cmp = (a: Ymd, b: Ymd) => a.y - b.y || a.m - b.m || a.d - b.d;
const dayNumber = ({ y, m, d }: Ymd) => Date.UTC(y, m - 1, d) / 86_400_000;

/** Whole years old on `day`. */
export function ageOn(birth: Ymd, day: Ymd): number {
  let age = day.y - birth.y;
  if (day.m < birth.m || (day.m === birth.m && day.d < birth.d)) age--;
  return age;
}

export function isOldEnough(birth: Ymd, today: Ymd, minAge = MIN_AGE): boolean {
  return cmp(birth, today) <= 0 && ageOn(birth, today) >= minAge;
}

export function isDrinkingAge(birth: Ymd, today: Ymd): boolean {
  return isOldEnough(birth, today, DRINKING_AGE);
}

/** The Pours tab unlocks this many days before a member's 21st birthday, so they can plan it. */
export const POUR_EARLY_DAYS = 5;

export function addDays({ y, m, d }: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * May see, vybe, comment on and review alcohol posts: 21+, or within 5 days of turning 21.
 * Mirrors private.user_has_pour_access in SQL. Liquid Lovers and drinks Link Ups stay strictly 21+.
 */
export function hasPourAccess(birth: Ymd, today: Ymd): boolean {
  return isDrinkingAge(birth, addDays(today, POUR_EARLY_DAYS));
}

/** The birthday as celebrated in a given year (Feb 29 → Feb 28 in non-leap years). */
export function birthdayInYear(birth: Ymd, year: number): Ymd {
  if (birth.m === 2 && birth.d === 29 && !isLeap(year)) return { y: year, m: 2, d: 28 };
  return { y: year, m: birth.m, d: birth.d };
}

/** Next birthday on or after `today`. */
export function nextBirthday(birth: Ymd, today: Ymd): Ymd {
  const thisYear = birthdayInYear(birth, today.y);
  return cmp(thisYear, today) >= 0 ? thisYear : birthdayInYear(birth, today.y + 1);
}

export function daysBetween(from: Ymd, to: Ymd): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

export type PerkWindow = "day" | "week" | "month";

export const WINDOW_LABEL: Record<PerkWindow, string> = {
  day: "On your birthday",
  week: "Birthday week",
  month: "Birthday month",
};

/**
 * Can a perk with this window be used today?
 * day: only on the birthday · week: 3 days either side · month: the birthday's calendar month.
 */
export function perkUsableOn(window: PerkWindow, birth: Ymd, today: Ymd): boolean {
  // Look at the birthday nearest to today (this year's, or last/next year's around New Year).
  const candidates = [today.y - 1, today.y, today.y + 1].map((y) => birthdayInYear(birth, y));
  const nearest = candidates.reduce((a, b) => (Math.abs(daysBetween(today, b)) < Math.abs(daysBetween(today, a)) ? b : a));
  const diff = daysBetween(today, nearest);
  switch (window) {
    case "day":
      return diff === 0;
    case "week":
      return Math.abs(diff) <= 3;
    case "month":
      return birthdayInYear(birth, today.y).m === today.m;
  }
}

export type BirthdayStatus =
  | { kind: "today" }
  | { kind: "soon"; days: number; date: Ymd } // within 30 days
  | { kind: "later"; days: number; date: Ymd };

export function birthdayStatus(birth: Ymd, today: Ymd): BirthdayStatus {
  const next = nextBirthday(birth, today);
  const days = daysBetween(today, next);
  if (days === 0) return { kind: "today" };
  return days <= 30 ? { kind: "soon", days, date: next } : { kind: "later", days, date: next };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const formatMonthDay = ({ m, d }: Ymd) => `${MONTHS[m - 1]} ${d}`;

/** Today's calendar date in a time zone (default: Eastern, VYBR8's launch market). */
export function todayIn(timeZone = "America/New_York", now: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parseYmd(parts)!;
}
