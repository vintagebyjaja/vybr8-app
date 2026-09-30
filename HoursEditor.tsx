"use client";

import { useState } from "react";

type Row = { open: boolean; allDay: boolean; opens: string; closes: string };
const DAYS = [
  { d: 1, name: "Monday" }, { d: 2, name: "Tuesday" }, { d: 3, name: "Wednesday" }, { d: 4, name: "Thursday" },
  { d: 5, name: "Friday" }, { d: 6, name: "Saturday" }, { d: 0, name: "Sunday" },
];
const field = "min-h-10 rounded-lg border border-line bg-ink px-2 text-sm tabular-nums disabled:opacity-40";

/** Set the week's hours: one opening per day, closed days, 24 hours, and quick "copy Monday" buttons. */
export function HoursEditor({
  action, locationId, slug, initial, mode,
}: {
  action: (f: FormData) => void | Promise<void>;
  locationId: string;
  slug: string;
  initial: { weekday: number; opensAt: string; closesAt: string }[];
  mode: "save" | "suggest";
}) {
  const [rows, setRows] = useState<Record<number, Row>>(() => {
    const out: Record<number, Row> = {};
    for (const { d } of DAYS) {
      const h = initial.filter((x) => x.weekday === d).sort((a, b) => a.opensAt.localeCompare(b.opensAt))[0];
      const opens = h?.opensAt.slice(0, 5) ?? "11:00";
      const closes = h?.closesAt.slice(0, 5) ?? "21:00";
      out[d] = { open: !!h || initial.length === 0, allDay: !!h && opens === "00:00" && (closes === "23:59" || closes === "00:00"), opens, closes };
    }
    return out;
  });
  const set = (d: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [d]: { ...r[d]!, ...patch } }));
  const copyMonday = (days: number[]) => setRows((r) => { const m = r[1]!; const n = { ...r }; for (const d of days) n[d] = { ...m }; return n; });

  const hours = DAYS.filter(({ d }) => rows[d]!.open).map(({ d }) => {
    const r = rows[d]!;
    return r.allDay ? { weekday: d, opens: "00:00", closes: "23:59" } : { weekday: d, opens: r.opens, closes: r.closes };
  });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="location" value={locationId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="hours" value={JSON.stringify(hours)} />
      <ul className="flex flex-col gap-2">
        {DAYS.map(({ d, name }) => {
          const r = rows[d]!;
          return (
            <li key={d} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 sm:grid-cols-[7rem_auto_1fr]">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={r.open} onChange={(e) => set(d, { open: e.target.checked })} className="size-4 accent-[var(--color-mint)]" />
                {name.slice(0, 3)}
              </label>
              {r.open ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="time" aria-label={`${name} opens`} value={r.opens} disabled={r.allDay} onChange={(e) => set(d, { opens: e.target.value })} className={field} />
                  <span className="text-muted">to</span>
                  <input type="time" aria-label={`${name} closes`} value={r.closes} disabled={r.allDay} onChange={(e) => set(d, { closes: e.target.value })} className={field} />
                  <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={r.allDay} onChange={(e) => set(d, { allDay: e.target.checked })} className="size-3.5" /> 24 hrs</label>
                </div>
              ) : (
                <span className="text-sm text-faint">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => copyMonday([2, 3, 4, 5])} className="rounded-full border border-line px-3 py-1.5 font-bold text-muted hover:text-text">Copy Monday to Tue–Fri</button>
        <button type="button" onClick={() => copyMonday([2, 3, 4, 5, 6, 0])} className="rounded-full border border-line px-3 py-1.5 font-bold text-muted hover:text-text">Same every day</button>
      </div>
      <p className="text-xs text-faint">Closes after midnight? Just pick the time (like 2:00 AM) and VYBR8 knows it&rsquo;s the next morning.</p>
      {mode === "suggest" && (
        <input name="note" maxLength={200} placeholder="How do you know? (walked by, work there, called…)" className="min-h-10 rounded-lg border border-line bg-ink px-3 text-sm" />
      )}
      <button className="vybe-gradient min-h-11 self-start rounded-full px-6 text-sm font-bold text-ink">{mode === "save" ? "Save hours" : "Send hours to the VYBR8 Team"}</button>
    </form>
  );
}
