import { gaugeDash } from "@/domain/health/health";

/** Half-circle step gauge (mint = health). */
export function StepGauge({ steps, goal, badge }: { steps: number | null; goal: number; badge: number | null }) {
  const r = 120;
  const { length, filled } = gaugeDash((steps ?? 0) / goal, r);
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <svg viewBox="0 0 280 160" className="w-full" role="img" aria-label={steps == null ? "No steps logged yet" : `${steps.toLocaleString()} of ${goal.toLocaleString()} steps`}>
        <defs>
          <linearGradient id="gauge-g" x1="0" x2="1">
            <stop offset="0" stopColor="#5fcf98" />
            <stop offset="1" stopColor="var(--color-mint)" />
          </linearGradient>
        </defs>
        <path d="M20 145 A120 120 0 0 1 260 145" fill="none" stroke="var(--color-surface-2)" strokeWidth="18" strokeLinecap="round" />
        <path d="M20 145 A120 120 0 0 1 260 145" fill="none" stroke="url(#gauge-g)" strokeWidth="18" strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`} style={{ filter: "drop-shadow(0 0 10px rgba(148,227,184,.45))" }} />
      </svg>
      <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
        <ShoeIcon className="mb-1 size-8 text-mint" />
        <p className="font-display text-5xl font-extrabold tabular-nums leading-none">{steps == null ? "–" : steps.toLocaleString()}</p>
        <p className="text-lg text-muted">steps</p>
        <p className="mt-1 text-sm text-faint">Goal {goal.toLocaleString()}</p>
      </div>
      {badge != null && (
        <span className={`absolute right-2 top-2 rounded-full px-3 py-1 text-sm font-extrabold ${badge >= 0 ? "bg-mint/20 text-mint" : "bg-surface-2 text-muted"}`}>
          {badge >= 0 ? "+" : ""}{badge}%
        </span>
      )}
    </div>
  );
}

export function ShoeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M2 17.5V15c0-.6.4-1 1-1h3.5l3-5 3 1.5-1 1.8 3 1.2 1-1.5c3 .8 5.5 2.8 6.5 5.5v1H2Z" />
      <path d="M2 18.8h20v1.7H2z" />
    </svg>
  );
}
