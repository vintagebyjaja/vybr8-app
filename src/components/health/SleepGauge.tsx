import { formatClock, formatDuration, gaugeDash, QUALITY_LABEL } from "@/domain/health/health";

/** Half-circle sleep meter: hours asleep against the person's sleep goal. */
export function SleepGauge({ minutes, goal, bed, wake, quality }: { minutes: number | null; goal: number; bed: string | null; wake: string | null; quality: number | null }) {
  const r = 120;
  const { length, filled } = gaugeDash((minutes ?? 0) / goal, r);
  const pct = minutes == null ? null : Math.round((minutes / goal) * 100);
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <svg viewBox="0 0 280 160" className="w-full" role="img" aria-label={minutes == null ? "No sleep logged yet" : `${formatDuration(minutes)} of sleep, goal ${formatDuration(goal)}`}>
        <defs>
          <linearGradient id="sleep-g" x1="0" x2="1">
            <stop offset="0" stopColor="#8f7cf5" />
            <stop offset="1" stopColor="var(--color-sky)" />
          </linearGradient>
        </defs>
        <path d="M20 145 A120 120 0 0 1 260 145" fill="none" stroke="var(--color-surface-2)" strokeWidth="18" strokeLinecap="round" />
        {minutes != null && (
          <path d="M20 145 A120 120 0 0 1 260 145" fill="none" stroke="url(#sleep-g)" strokeWidth="18" strokeLinecap="round"
            strokeDasharray={`${filled} ${length}`} style={{ filter: "drop-shadow(0 0 10px rgba(198,175,255,.45))" }} />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
        <MoonIcon className="mb-1 size-8 text-lavender" />
        <p className="font-display text-5xl font-extrabold tabular-nums leading-none">{minutes == null ? "–" : formatDuration(minutes)}</p>
        <p className="text-lg text-muted">sleep</p>
        <p className="mt-1 text-sm text-faint">Goal {formatDuration(goal)}</p>
      </div>
      {pct != null && (
        <span className={`absolute right-2 top-2 rounded-full px-3 py-1 text-sm font-extrabold ${pct >= 90 ? "bg-lavender/20 text-lavender" : "bg-surface-2 text-muted"}`}>{pct}%</span>
      )}
      {bed && wake && (
        <p className="mt-2 text-center text-sm text-muted">
          Bed {formatClock(bed)} · Up {formatClock(wake)}{quality ? ` · ${QUALITY_LABEL[quality]}` : ""}
        </p>
      )}
    </div>
  );
}

export function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
      <path d="M16.5 4.5l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5zM19.5 8.5l.3.8.8.3-.8.3-.3.8-.3-.8-.8-.3.8-.3z" />
    </svg>
  );
}
