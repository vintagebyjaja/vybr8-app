/** Opening hours for people: "Open now · closes 10 PM", "Closed · opens tomorrow 11 AM", and the week at a glance. */
import { localClock, type Hours } from "./map.ts";

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const mins = (t: string) => {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};
const allDay = (h: Hours) => mins(h.opensAt) === 0 && (mins(h.closesAt) >= 23 * 60 + 59 || mins(h.closesAt) === 0);

/** "17:00" → "5 PM", "17:30" → "5:30 PM", "00:00" → "12 AM". */
export function clock12(t: string): string {
  const m = mins(t) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export type DayHours = { weekday: number; name: string; ranges: string[] };

/** Monday → Sunday, each with its opening times ("11 AM – 10 PM", "Open 24 hours") or none (closed). */
export function weekSchedule(hours: readonly Hours[]): DayHours[] {
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    weekday: d,
    name: DAY[d]!,
    ranges: hours
      .filter((h) => h.weekday === d)
      .sort((a, b) => mins(a.opensAt) - mins(b.opensAt))
      .map((h) => (allDay(h) ? "Open 24 hours" : `${clock12(h.opensAt)} – ${clock12(h.closesAt)}`)),
  }));
}

/** Whether it's open right now and what happens next, in the place's time zone. Null when hours aren't known. */
export function openStatus(hours: readonly Hours[], timeZone: string, now: Date = new Date()): { open: boolean; line: string } | null {
  if (!hours.length) return null;
  const { weekday, minutes } = localClock(timeZone, now);
  const yesterday = (weekday + 6) % 7;
  for (const h of hours) {
    const o = mins(h.opensAt);
    const c = mins(h.closesAt);
    const overnight = c <= o;
    const openToday = h.weekday === weekday && (overnight ? minutes >= o : minutes >= o && minutes < c);
    const fromYesterday = h.weekday === yesterday && overnight && minutes < c;
    if (openToday || fromYesterday) {
      if (allDay(h)) return { open: true, line: "Open now · 24 hours" };
      return { open: true, line: `Open now · closes ${clock12(h.closesAt)}` };
    }
  }
  // Closed: find the next opening in the coming week.
  for (let ahead = 0; ahead < 7; ahead++) {
    const d = (weekday + ahead) % 7;
    const next = hours
      .filter((h) => h.weekday === d && (ahead > 0 || mins(h.opensAt) > minutes))
      .sort((a, b) => mins(a.opensAt) - mins(b.opensAt))[0];
    if (next) {
      const when = ahead === 0 ? "" : ahead === 1 ? "tomorrow " : `${SHORT[d]} `;
      return { open: false, line: `Closed · opens ${when}${clock12(next.opensAt)}` };
    }
  }
  return { open: false, line: "Closed" };
}
