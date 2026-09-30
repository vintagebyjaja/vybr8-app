import Link from "next/link";
import { ShoeIcon } from "@/components/health/StepGauge";

/** Home screen summary of today's activity. Private: only the signed-in person sees it. */
export function ActiveVybeCard({ steps, goal, badge }: { steps: number | null; goal: number; badge: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, (steps ?? 0) / goal);
  return (
    <Link href="/health" className="flex items-center gap-5 rounded-[var(--radius-card)] border border-mint/30 bg-[linear-gradient(135deg,#1d4a3a,#2c6b54_55%,#3d7f67)] p-5 shadow-lg transition hover:brightness-110">
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="6" />
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-mint)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} />
        </svg>
        <ShoeIcon className="absolute inset-0 m-auto size-9 text-mint" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center justify-between text-sm font-extrabold uppercase tracking-wider text-white/90">Active Vybe <span aria-hidden className="text-2xl leading-none">›</span></p>
        {steps == null ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-white">Log today&rsquo;s steps</p>
            <p className="text-sm text-white/75">See what to eat based on how active you are.</p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-extrabold tabular-nums text-white">{steps.toLocaleString()}</p>
            <p className="font-semibold text-white">steps today</p>
            {badge != null && <p className="text-sm text-white/80">{badge >= 0 ? `+${badge}% more active` : `${Math.abs(badge)}% less active`} than your average day.</p>}
          </>
        )}
      </div>
    </Link>
  );
}
