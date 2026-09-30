import Link from "next/link";
import { RangeTabs } from "@/components/health/RangeTabs";
import { StepBars } from "@/components/health/StepBars";
import { ShoeIcon, StepGauge } from "@/components/health/StepGauge";
import { Button } from "@/components/ui/Button";
import {
  HEALTH_APPS, RECOMMENDATIONS, addDays, dayLabel, isYmd, milesFrom, recommendationsFor, versusAverage, ymdIn, type Range,
} from "@/domain/health/health";
import { findCity } from "@/domain/map/map";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/entitlements";
import { getActiveVybe } from "@/server/health";
import { getViewerCity } from "@/server/map";
import { logActivity, requestHealthApp, setStepGoal } from "./actions";

export const metadata = { title: "Active Vybe" };

const TONE: Record<string, string> = { coral: "bg-coral/20 text-coral", orange: "bg-orange/20 text-orange", sky: "bg-sky/20 text-sky", mint: "bg-mint/20 text-mint" };
const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm tabular-nums placeholder:text-faint focus:border-mint";

type Search = { searchParams: Promise<{ date?: string; range?: string; e?: string; saved?: string }> };

export default async function HealthPage({ searchParams }: Search) {
  const viewer = await requireViewer("/health");
  const sp = await searchParams;
  const city = findCity(await getViewerCity(viewer));
  const today = ymdIn(city.timezone);
  const date = isYmd(sp.date) && sp.date <= today ? sp.date : today;
  const range: Range = sp.range === "week" || sp.range === "month" ? sp.range : "day";
  const [av, canHistory] = await Promise.all([getActiveVybe(viewer.id, date, city.timezone), can("expanded_active_vybe")]);

  const steps = av.today?.steps ?? null;
  const badge = versusAverage(steps, av.history.slice(-8, -1).map((h) => h.steps));
  const rec = recommendationsFor(steps, av.goal, av.today?.activeMinutes ?? null);
  const synced = av.today?.sources.find((s) => s !== "manual");
  const syncedName = HEALTH_APPS.find((a) => a.key === synced)?.name;
  const n = av.nutrition;
  const calTarget = n.target?.calories ?? null;
  const href = (p: { date?: string; range?: string }) => `/health?${new URLSearchParams({ date: p.date ?? date, range: p.range ?? range })}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-mint/20 text-mint"><ShoeIcon className="size-6" /></span>
          <div>
            <h1 className="font-display text-3xl font-extrabold leading-tight">Active Vybe</h1>
            <p className="text-sm text-muted">{syncedName ? `Connected to ${syncedName}` : "Logged by you · private to you"}</p>
          </div>
        </div>
        <a href="#settings" aria-label="Activity settings" className="grid size-11 place-items-center rounded-full border border-line text-muted hover:text-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
        </a>
      </header>

      {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}
      {sp.saved && <p role="status" className="rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">Saved. Nice work.</p>}

      <RangeTabs active={range} hrefFor={(r) => href({ range: r })} />

      {range === "day" ? (
        <>
          <div className="flex items-center justify-between">
            <Link href={href({ date: addDays(date, -1) })} aria-label="Previous day" className="grid size-10 place-items-center rounded-full text-2xl text-muted hover:text-text">‹</Link>
            <p className="text-center"><span className="block font-bold">{date === today ? "Today" : dayLabel(date).weekday}</span><span className="text-sm text-muted">{dayLabel(date).long}</span></p>
            {date < today ? (
              <Link href={href({ date: addDays(date, 1) })} aria-label="Next day" className="grid size-10 place-items-center rounded-full text-2xl text-muted hover:text-text">›</Link>
            ) : <span className="size-10" />}
          </div>

          <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <StepGauge steps={steps} goal={av.goal} badge={badge} />
            <dl className="grid grid-cols-3 divide-x divide-line text-center">
              <div><dd className="font-display text-2xl font-extrabold tabular-nums">{milesFrom(av.today?.distanceM ?? null) ?? "–"}<span className="text-base"> mi</span></dd><dt className="text-xs text-muted">Distance</dt></div>
              <div><dd className="font-display text-2xl font-extrabold tabular-nums">{av.today?.activeCalories?.toLocaleString() ?? "–"}</dd><dt className="text-xs text-muted">Active Cal</dt></div>
              <div><dd className="font-display text-2xl font-extrabold tabular-nums">{av.today?.activeMinutes ?? "–"}<span className="text-base"> min</span></dd><dt className="text-xs text-muted">Activity</dt></div>
            </dl>
            {steps == null && <p className="text-center text-sm text-muted">Nothing logged for this day yet. Add it below, or connect a health app when the VYBR8 app arrives.</p>}
          </section>

          <section aria-labelledby="rec-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-mint/30 bg-[linear-gradient(160deg,rgba(148,227,184,.16),rgba(148,227,184,.04))] p-5">
            <div>
              <h2 id="rec-h" className="font-bold">Based on your activity {date === today ? "today" : "this day"}, VYBR8 recommends:</h2>
              <p className="mt-1 text-sm text-muted">{rec.line}</p>
            </div>
            <ul className="grid grid-cols-4 gap-2 text-center">
              {rec.recs.map((k) => (
                <li key={k} className="flex flex-col items-center gap-1.5">
                  <span className={`grid size-14 place-items-center rounded-full font-display text-lg font-extrabold ${TONE[RECOMMENDATIONS[k].tone]}`}>{RECOMMENDATIONS[k].label.slice(0, 1)}</span>
                  <span className="text-xs font-semibold leading-tight">{RECOMMENDATIONS[k].label}</span>
                </li>
              ))}
            </ul>
            <Link href={`/health/plan?${new URLSearchParams({ day: date, type: rec.dayType })}`} className="vybe-gradient flex min-h-12 items-center justify-center rounded-full font-bold text-ink hover:brightness-110">
              Find My Meal Plan
            </Link>
          </section>

          <section aria-labelledby="nut-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 id="nut-h" className="font-bold">{date === today ? "Today's" : "Day's"} Nutrition</h2>
              <span className="text-xs text-faint">{n.meals} {n.meals === 1 ? "meal" : "meals"} logged</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-mint),var(--color-sky))]" style={{ width: `${calTarget ? Math.min(100, (n.calories / calTarget) * 100) : n.calories ? 100 : 0}%` }} />
            </div>
            <p className="font-display text-xl font-extrabold tabular-nums">{n.calories.toLocaleString()}{calTarget ? <span className="text-muted"> / {calTarget.toLocaleString()} cal</span> : <span className="text-muted"> cal</span>}</p>
            <dl className="grid grid-cols-3 gap-3">
              {([["Protein", n.protein, n.target?.protein, "bg-mint"], ["Carbs", n.carbs, n.target?.carbs, "bg-orange"], ["Fat", n.fat, n.target?.fat, "bg-lavender"]] as const).map(([label, v, t, bar]) => (
                <div key={label} className="flex gap-2">
                  <span className={`w-1 rounded-full ${bar}`} />
                  <div><dd className="font-display text-lg font-extrabold tabular-nums">{v}g{t ? <span className="text-xs text-faint"> / {t}g</span> : null}</dd><dt className="text-xs text-muted">{label}</dt></div>
                </div>
              ))}
            </dl>
            {!calTarget && <p className="text-xs text-faint">Set calorie and macro targets from any dish&rsquo;s Deep Dive (VYBR8+). Log meals from a dish page or your Vybe Plan.</p>}
          </section>

          <details className="group rounded-[var(--radius-card)] border border-line bg-surface p-5" open={steps == null}>
            <summary className="cursor-pointer list-none font-bold">{steps == null ? "Log this day's activity" : "Update this day's activity"} <span className="text-muted group-open:hidden">+</span></summary>
            <form action={logActivity} className="mt-4 grid grid-cols-2 gap-3">
              <input type="hidden" name="date" value={date} />
              <label className="flex flex-col gap-1 text-sm font-semibold">Steps<input name="steps" inputMode="numeric" defaultValue={av.today?.steps ?? ""} placeholder="10,000" className={input} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Distance (mi)<input name="miles" inputMode="decimal" defaultValue={milesFrom(av.today?.distanceM ?? null) ?? ""} placeholder="4.5" className={input} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Active calories<input name="calories" inputMode="numeric" defaultValue={av.today?.activeCalories ?? ""} placeholder="500" className={input} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Active minutes<input name="minutes" inputMode="numeric" defaultValue={av.today?.activeMinutes ?? ""} placeholder="45" className={input} /></label>
              <Button type="submit" className="col-span-2">Save</Button>
            </form>
          </details>
        </>
      ) : canHistory ? (
        <StepBars days={range === "week" ? av.history.slice(-7) : av.history} goal={av.goal} />
      ) : (
        <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-center">
          <p className="font-display text-xl font-extrabold">Weekly and monthly trends</p>
          <p className="text-sm text-muted">See your steps by week and month, days at goal, and your averages with VYBR8+.</p>
          <Link href="/pricing" className="vybe-gradient mx-auto inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">See VYBR8+</Link>
        </section>
      )}

      <section aria-labelledby="apps-h" className="flex flex-col gap-3">
        <div>
          <h2 id="apps-h" className="text-xl font-extrabold">Connect Your Health Apps</h2>
          <p className="text-sm text-muted">Sync your activity to personalize your Vybe.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {HEALTH_APPS.map((a) => {
            const connected = av.today?.sources.includes(a.key);
            const asked = av.requested.includes(a.key);
            return (
              <li key={a.key} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 font-display text-lg font-extrabold">{a.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted">{a.line}</span>
                </span>
                {connected ? (
                  <span className="rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-ink">Connected</span>
                ) : asked ? (
                  <span className="rounded-full border border-mint/40 px-3 py-1.5 text-xs font-bold text-mint">On the list</span>
                ) : (
                  <form action={requestHealthApp}>
                    <input type="hidden" name="provider" value={a.key} />
                    <button className="rounded-full border border-line px-4 py-1.5 text-xs font-bold hover:bg-surface-2">Connect</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-faint">
          Apple Health, Health Connect and Samsung Health live on your phone, so they sync through the VYBR8 phone app (coming soon). Tap Connect and
          we&rsquo;ll link it the day it&rsquo;s ready. Your activity is private: never shared with friends, businesses or the VYBR8 Team.
        </p>
      </section>

      <section id="settings" aria-labelledby="set-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 id="set-h" className="font-bold">Daily step goal</h2>
        <form action={setStepGoal} className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor="goal">Daily step goal</label>
          <input id="goal" name="goal" type="number" min={1000} max={50000} step={500} defaultValue={av.goal} className={input} />
          <Button type="submit" variant="ghost">Save</Button>
        </form>
        <p className="mt-2 text-xs text-faint">VYBR8 gives wellness information, not medical advice.</p>
      </section>
    </div>
  );
}
