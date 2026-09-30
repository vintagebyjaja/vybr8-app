import { ACTIVITY_LEVELS, dayLabel, formatDuration, type ActivityLevel } from "@/domain/health/health";

const DOT: Record<string, string> = { very_active: "bg-coral", active: "bg-orange", light: "bg-sky", sitting: "bg-lavender", gaming: "bg-lavender", rest: "bg-mint" };

/** Sleep per night against the goal, with each day's activity check-in as a dot. Missing days stay empty. */
export function SleepBars({ days, goal }: { days: { day: string; sleepMin: number | null; level: ActivityLevel | null }[]; goal: number }) {
  const max = Math.max(goal * 1.25, ...days.map((d) => d.sleepMin ?? 0));
  const logged = days.filter((d) => d.sleepMin != null);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + d.sleepMin!, 0) / logged.length) : null;
  const hit = logged.filter((d) => d.sleepMin! >= goal - 30).length;
  const counts = new Map<string, number>();
  for (const d of days) if (d.level) counts.set(d.level, (counts.get(d.level) ?? 0) + 1);
  return (
    <section aria-label="Sleep by night" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-lg font-extrabold">{avg == null ? "No sleep logged yet" : `${formatDuration(avg)} avg sleep`}</p>
        <p className="text-sm text-muted">{hit} of {days.length} nights near goal</p>
      </div>
      <div className="relative flex h-44 items-end gap-1">
        <div className="absolute inset-x-0 border-t border-dashed border-lavender/50" style={{ bottom: `${(goal / max) * 100}%` }}>
          <span className="absolute -top-5 right-0 text-[10px] font-bold text-lavender">Goal {formatDuration(goal)}</span>
        </div>
        {days.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${dayLabel(d.day).long}: ${d.sleepMin == null ? "no sleep logged" : formatDuration(d.sleepMin)}`}>
            {d.sleepMin == null ? (
              <div className="h-1 w-full rounded-full bg-surface-2" />
            ) : (
              <div className={`w-full rounded-t-md ${d.sleepMin >= goal - 30 ? "bg-lavender" : "bg-lavender/40"}`} style={{ height: `${Math.max(2, (d.sleepMin / max) * 100)}%` }} />
            )}
            <span className={`size-1.5 rounded-full ${d.level ? DOT[d.level] : "bg-transparent"}`} />
          </div>
        ))}
      </div>
      {days.length <= 7 && (
        <div className="flex gap-1 text-center text-[11px] text-faint">
          {days.map((d) => <span key={d.day} className="flex-1">{dayLabel(d.day).weekday}</span>)}
        </div>
      )}
      {counts.size > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {ACTIVITY_LEVELS.filter((l) => counts.has(l.key)).map((l) => (
            <li key={l.key} className="inline-flex items-center gap-1.5"><i className={`size-2 rounded-full ${DOT[l.key]}`} />{l.label} · {counts.get(l.key)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
