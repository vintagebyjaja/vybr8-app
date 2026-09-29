/**
 * Food trucks: where a truck is, when, and how sure we are.
 * Pure functions, no framework imports. A scheduled future stop is never "here now".
 */
import { localClock } from "../map/map.ts";
import { cityDay, cityTimeToDate } from "../linkups/linkups.ts";

export type StopStatus = "scheduled" | "open" | "delayed" | "cancelled" | "sold_out" | "closed";
export type LocationSource = "operator" | "vybr8_team" | "community" | "provider";

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  scheduled: "Scheduled",
  open: "Open",
  delayed: "Delayed",
  cancelled: "Cancelled",
  sold_out: "Sold out",
  closed: "Closed",
};

export const SOURCE_LABEL: Record<LocationSource, string> = {
  operator: "Posted by the truck",
  vybr8_team: "Added by the VYBR8 team",
  community: "Shared by the community",
  provider: "From a schedule partner",
};

/** Statuses an operator can set on a stop from the dashboard. */
export const OPERATOR_STATUSES = ["open", "delayed", "sold_out", "closed", "cancelled"] as const;

export const LIVE_MIN_HOURS = 1;
export const LIVE_MAX_HOURS = 8;

export type StopLike = { startAt: string | Date; endAt: string | Date; status: StopStatus };
export type StopState = "here_now" | "later_today" | "upcoming" | "ended" | "cancelled";

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const DEFAULT_TZ = "America/New_York";

/**
 * Where a stop stands right now.
 * - cancelled stays cancelled
 * - open / delayed / sold_out count as "here now" only inside start..end
 * - a scheduled stop is never "here now", even inside its window (the truck hasn't confirmed)
 * - closed, or past its end, is "ended"
 */
export function stopState(stop: StopLike, now: Date, timeZone: string = DEFAULT_TZ): StopState {
  if (stop.status === "cancelled") return "cancelled";
  const start = ms(stop.startAt), end = ms(stop.endAt), t = now.getTime();
  if (end <= t || stop.status === "closed") return "ended";
  if (start <= t) return stop.status === "scheduled" ? "later_today" : "here_now";
  return cityDay(new Date(start), timeZone) === cityDay(now, timeZone) ? "later_today" : "upcoming";
}

/** "YYYY-MM-DD" plus n days (calendar math, no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "Sat Oct 3" for a calendar day. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d))).replace(",", "");
}

/** Stops grouped by city day: TODAY, TOMORROW, then "Sat Oct 3". A stop still running from yesterday counts as today. */
export function groupStopsByDay<T extends StopLike>(stops: readonly T[], timeZone: string, now: Date): { label: string; day: string; stops: T[] }[] {
  const today = cityDay(now, timeZone);
  const tomorrow = addDays(today, 1);
  const groups = new Map<string, T[]>();
  for (const s of [...stops].sort((a, b) => ms(a.startAt) - ms(b.startAt))) {
    let day = cityDay(new Date(ms(s.startAt)), timeZone);
    if (day < today && ms(s.endAt) > now.getTime()) day = today;
    const list = groups.get(day) ?? [];
    list.push(s);
    groups.set(day, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => ({ day, label: day === today ? "TODAY" : day === tomorrow ? "TOMORROW" : dayLabel(day), stops: list }));
}

/** "6:00 PM" in the city's time zone. */
export function formatTime(date: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(ms(date)));
}

/** "12:00 PM – 3:00 PM" in the city's time zone. */
export function formatWindow(start: string | Date, end: string | Date, timeZone: string): string {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`;
}

/** "Sat 5:00 PM" in the city's time zone. */
export function formatDayTime(date: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms(date)));
}

export type TruckFilter = "open_now" | "today" | "weekend" | "all";
export const TRUCK_FILTERS: { key: TruckFilter; label: string }[] = [
  { key: "open_now", label: "OPEN NOW" },
  { key: "today", label: "TODAY" },
  { key: "weekend", label: "THIS WEEKEND" },
  { key: "all", label: "ALL" },
];
export function parseTruckFilter(v: string | null | undefined): TruckFilter {
  return v === "open_now" || v === "today" || v === "weekend" || v === "all" ? v : "today";
}

export const ALL_DAYS_AHEAD = 14;

/**
 * The time window a filter covers, in the city's time zone.
 * - open_now: this minute
 * - today: now until midnight
 * - weekend: the upcoming Friday 5 PM until Sunday ends (from now if the weekend has started)
 * - all: the next 14 days
 */
export function windowFor(filter: TruckFilter, now: Date, timeZone: string): { from: Date; to: Date } {
  const today = cityDay(now, timeZone);
  if (filter === "open_now") return { from: now, to: new Date(now.getTime() + 60_000) };
  if (filter === "today") return { from: now, to: cityTimeToDate(`${addDays(today, 1)}T00:00`, timeZone) };
  if (filter === "all") return { from: now, to: new Date(now.getTime() + ALL_DAYS_AHEAD * 86_400_000) };
  const { weekday } = localClock(timeZone, now); // 0 = Sunday
  // Days from today back/forward to this weekend's Friday.
  const toFriday = weekday === 0 ? -2 : weekday === 6 ? -1 : 5 - weekday;
  const friday = addDays(today, toFriday);
  const start = cityTimeToDate(`${friday}T17:00`, timeZone);
  const end = cityTimeToDate(`${addDays(friday, 3)}T00:00`, timeZone);
  return { from: start.getTime() > now.getTime() ? start : now, to: end };
}

/** "WE'RE HERE" lasts 1–8 hours, then turns off by itself. */
export function liveExpiry(hours: number, now: Date = new Date()): Date {
  const h = Number.isFinite(hours) ? Math.min(LIVE_MAX_HOURS, Math.max(LIVE_MIN_HOURS, Math.round(hours))) : LIVE_MIN_HOURS;
  return new Date(now.getTime() + h * 3_600_000);
}

/** Google Maps directions link for a point. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** "5 min ago", "3 hr ago", "Sep 28". */
export function postedAgo(date: string | Date, now: Date, timeZone: string): string {
  const diff = Math.max(0, now.getTime() - ms(date));
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(ms(date)));
}
