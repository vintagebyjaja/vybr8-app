import { dayLabel } from "@/domain/health/health";

/** Steps per day with the goal line. Days without data show as empty slots, never as zero. */
export function StepBars({ days, goal }: { days: { day: string; steps: number | null }[]; goal: number }) {
  const max = Math.max(goal * 1.2, ...days.map((d) => d.steps ?? 0));
  const logged = days.filter((d) => d.steps != null);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + d.steps!, 0) / logged.length) : null;
  const hit = logged.filter((d) => d.steps! >= goal).length;
  return (
    <section aria-label="Steps by day" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-lg font-extrabold">{avg == null ? "No steps logged yet" : `${avg.toLocaleString()} avg steps`}</p>
        <p className="text-sm text-muted">{hit} of {days.length} days at goal</p>
      </div>
      <div className="relative flex h-44 items-end gap-1">
        <div className="absolute inset-x-0 border-t border-dashed border-mint/50" style={{ bottom: `${(goal / max) * 100}%` }}>
          <span className="absolute -top-5 right-0 text-[10px] font-bold text-mint">Goal {goal.toLocaleString()}</span>
        </div>
        {days.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${dayLabel(d.day).long}: ${d.steps == null ? "no data" : d.steps.toLocaleString()}`}>
            {d.steps == null ? (
              <div className="h-1 rounded-full bg-surface-2" />
            ) : (
              <div className={`rounded-t-md ${d.steps >= goal ? "bg-mint" : "bg-mint/40"}`} style={{ height: `${Math.max(2, (d.steps / max) * 100)}%` }} />
            )}
          </div>
        ))}
      </div>
      {days.length <= 7 && (
        <div className="flex gap-1 text-center text-[11px] text-faint">
          {days.map((d) => <span key={d.day} className="flex-1">{dayLabel(d.day).weekday}</span>)}
        </div>
      )}
    </section>
  );
}
