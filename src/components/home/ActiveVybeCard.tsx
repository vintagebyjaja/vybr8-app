import Link from "next/link";
import { MoonIcon } from "@/components/health/SleepGauge";
import { formatClock, formatDuration } from "@/domain/health/health";

/** Home screen summary: last night's sleep and today's check-in. Private: only the signed-in person sees it. */
export function ActiveVybeCard({ sleepMin, goal, wake, dayLabel, greeting = null, due = false }: {
  sleepMin: number | null; goal: number; wake: string | null; dayLabel: string | null; greeting?: string | null; due?: boolean;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, (sleepMin ?? 0) / goal);
  return (
    <Link href="/health" className="flex items-center gap-5 rounded-[var(--radius-card)] border border-lavender/30 bg-[linear-gradient(135deg,#2a2150,#3a2f6e_55%,#1f4a5c)] p-5 shadow-lg transition hover:brightness-110">
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="6" />
          {sleepMin != null && <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-lavender)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} />}
        </svg>
        <MoonIcon className="absolute inset-0 m-auto size-9 text-lavender" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center justify-between text-sm font-extrabold uppercase tracking-wider text-white/90">Active Vybe <span aria-hidden className="text-2xl leading-none">›</span></p>
        {greeting && <p className="flex items-center gap-2 text-sm font-bold text-lavender">{greeting}{due && <span className="rounded-full bg-lavender px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ink">Check in</span>}</p>}
        {sleepMin == null ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-white">How&rsquo;d you sleep?</p>
            <p className="text-sm text-white/75">Log last night and check in your day to see what to eat.</p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-extrabold tabular-nums text-white">{formatDuration(sleepMin)}</p>
            <p className="font-semibold text-white">sleep{wake ? ` · up at ${formatClock(wake)}` : ""}</p>
            <p className="text-sm text-white/80">{dayLabel ? `Today: ${dayLabel}` : "Check in how your day's going."}</p>
          </>
        )}
      </div>
    </Link>
  );
}
