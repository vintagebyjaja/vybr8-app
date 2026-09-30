import Link from "next/link";
import { CheckInForm } from "@/components/health/CheckInForm";
import { RangeTabs } from "@/components/health/RangeTabs";
import { SleepBars } from "@/components/health/SleepBars";
import { MoonIcon, SleepGauge } from "@/components/health/SleepGauge";
import { Button } from "@/components/ui/Button";
import {
  ACTIVITY_LEVELS, ACTIVITY_OPTIONS, QUALITY_LABEL, RECOMMENDATIONS, STEP_BANDS, activityScore, addDays, dayAdvice, dayLabel, isYmd, ymdIn, type Range,
} from "@/domain/health/health";
import { findCity } from "@/domain/map/map";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/entitlements";
import { getActiveVybe } from "@/server/health";
import { getViewerCity } from "@/server/map";
import { checkIn, logSleep, setSleepGoal } from "./actions";

export const metadata = { title: "Active Vybe" };

const TONE: Record<string, string> = { coral: "bg-coral/20 text-coral", orange: "bg-orange/20 text-orange", sky: "bg-sky/20 text-sky", mint: "bg-mint/20 text-mint", lavender: "bg-lavender/20 text-lavender" };
const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm tabular-nums placeholder:text-faint focus:border-lavender";

type Search = { searchParams: Promise<{ date?: string; range?: string; e?: string; saved?: string }> };

export default async function HealthPage({ searchParams }: Search) {
  const viewer = await requireViewer("/health");
  const sp = await searchParams;
  const city = findCity(await getViewerCity(viewer));
  const today = ymdIn(city.timezone);
  const date = isYmd(sp.date) && sp.date <= today ? sp.date : today;
  const range: Range = sp.range === "week" || sp.range === "month" ? sp.range : "day";
  const [av, canHistory] = await Promise.all([getActiveVybe(viewer.id, date, city.timezone), can("expanded_active_vybe")]);

  const ci = av.checkin;
  const levelInfo = ACTIVITY_LEVELS.find((l) => l.key === ci?.level);
  const advice = dayAdvice({
    sleepMin: av.sleep?.minutes ?? null, sleepGoal: av.sleepGoal, quality: av.sleep?.quality ?? null,
    level: ci?.level ?? null, score: activityScore(ci?.level ?? null, ci?.stepsBand ?? null, ci?.miles ?? null),
  });
  const n = av.nutrition;
  const calTarget = n.target?.calories ?? null;
  const isToday = date === today;
  const href = (p: { date?: string; range?: string }) => `/health?${new URLSearchParams({ date: p.date ?? date, range: p.range ?? range })}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-lavender/20 text-lavender"><MoonIcon className="size-6" /></span>
          <div>
            <h1 className="font-display text-3xl font-extrabold leading-tight">Active Vybe</h1>
            <p className="text-sm text-muted">Sleep and your day, logged by you · private to you</p>
          </div>
        </div>
        <a href="#settings" aria-label="Sleep goal settings" className="grid size-11 place-items-center rounded-full border border-line text-muted hover:text-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
        </a>
      </header>

      {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}
      {sp.saved && <p role="status" className="rounded-xl border border-lavender/40 bg-lavender/10 p-3 text-sm">{sp.saved === "sleep" ? "Sleep saved." : "Day saved. Nice."}</p>}

      <RangeTabs active={range} hrefFor={(r) => href({ range: r })} />

      {range === "day" ? (
        <>
          <div className="flex items-center justify-between">
            <Link href={href({ date: addDays(date, -1) })} aria-label="Previous day" className="grid size-10 place-items-center rounded-full text-2xl text-muted hover:text-text">‹</Link>
            <p className="text-center"><span className="block font-bold">{isToday ? "Today" : dayLabel(date).weekday}</span><span className="text-sm text-muted">{dayLabel(date).long}</span></p>
            {date < today ? (
              <Link href={href({ date: addDays(date, 1) })} aria-label="Next day" className="grid size-10 place-items-center rounded-full text-2xl text-muted hover:text-text">›</Link>
            ) : <span className="size-10" />}
          </div>

          {/* Sleep meter */}
          <section aria-labelledby="sleep-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 id="sleep-h" className="sr-only">Sleep</h2>
            <SleepGauge minutes={av.sleep?.minutes ?? null} goal={av.sleepGoal} bed={av.sleep?.bedTime ?? null} wake={av.sleep?.wakeTime ?? null} quality={av.sleep?.quality ?? null} />
            {advice.sleepLine && <p className="text-center text-sm text-muted">{advice.sleepLine}</p>}
            <details className="group rounded-2xl border border-line bg-ink p-4" open={!av.sleep}>
              <summary className="cursor-pointer list-none text-center font-bold">{av.sleep ? "Edit sleep" : `How did you sleep${isToday ? " last night" : ""}?`}</summary>
              <form action={logSleep} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="date" value={date} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-sm font-semibold">Went to bed<input type="time" name="bed" required defaultValue={av.sleep?.bedTime ?? "23:00"} className={input} /></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Woke up<input type="time" name="wake" required defaultValue={av.sleep?.wakeTime ?? "07:00"} className={input} /></label>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold">How rested do you feel?</legend>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((q) => (
                      <label key={q} className="cursor-pointer rounded-xl border border-line py-2 text-center text-xs font-bold has-[:checked]:border-lavender has-[:checked]:bg-lavender/20">
                        <input type="radio" name="quality" value={q} className="sr-only" defaultChecked={av.sleep?.quality === q} />{QUALITY_LABEL[q]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit">Save sleep</Button>
              </form>
            </details>
          </section>

          {/* How was your day */}
          <section aria-labelledby="day-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="day-h" className="font-display text-xl font-extrabold">{isToday ? "How's your day going?" : "How was this day?"}</h2>
              {levelInfo && <span className={`rounded-full px-3 py-1 text-xs font-bold ${TONE[levelInfo.tone]}`}>{levelInfo.label}</span>}
            </div>
            {ci && (
              <p className="text-sm text-muted">
                {[
                  ci.activities.map((a) => ACTIVITY_OPTIONS.find((o) => o.key === a)?.label).filter(Boolean).join(", "),
                  ci.miles != null ? `${ci.miles} mi` : ci.stepsBand ? STEP_BANDS.find((b) => b.key === ci.stepsBand)?.label : null,
                  ci.note,
                ].filter(Boolean).join(" · ") || "Checked in."}
              </p>
            )}
            <details className="group" open={!ci}>
              <summary className="cursor-pointer list-none text-sm font-bold text-sky">{ci ? "Change check-in" : "Pick one to check in"}</summary>
              <div className="mt-3"><CheckInForm action={checkIn} date={date} initial={ci} /></div>
            </details>
          </section>

          {/* Recommendations */}
          <section aria-labelledby="rec-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-mint/30 bg-[linear-gradient(160deg,rgba(148,227,184,.16),rgba(148,227,184,.04))] p-5">
            <div>
              <h2 id="rec-h" className="font-bold">Based on your sleep and your day, VYBR8 recommends:</h2>
              <p className="mt-1 text-sm text-muted">{av.sleep || ci ? advice.line : "Log your sleep and check in your day to get suggestions made for you."}</p>
            </div>
            <ul className="grid grid-cols-4 gap-2 text-center">
              {advice.recs.map((k) => (
                <li key={k} className="flex flex-col items-center gap-1.5">
                  <span className={`grid size-14 place-items-center rounded-full font-display text-lg font-extrabold ${TONE[RECOMMENDATIONS[k].tone]}`}>{RECOMMENDATIONS[k].label.slice(0, 1)}</span>
                  <span className="text-xs font-semibold leading-tight">{RECOMMENDATIONS[k].label}</span>
                </li>
              ))}
            </ul>
            <Link href={`/health/plan?${new URLSearchParams({ day: date, type: advice.dayType })}`} className="vybe-gradient flex min-h-12 items-center justify-center rounded-full font-bold text-ink hover:brightness-110">
              Find My Meal Plan
            </Link>
          </section>

          {/* Nutrition */}
          <section aria-labelledby="nut-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 id="nut-h" className="font-bold">{isToday ? "Today's" : "Day's"} Nutrition</h2>
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
            {!calTarget && <p className="text-xs text-faint">Log meals from a dish page or your Vybe Plan. Calorie and macro targets are part of VYBR8+.</p>}
          </section>
        </>
      ) : canHistory ? (
        <SleepBars days={range === "week" ? av.history.slice(-7) : av.history} goal={av.sleepGoal} />
      ) : (
        <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-center">
          <p className="font-display text-xl font-extrabold">Weekly and monthly trends</p>
          <p className="text-sm text-muted">See your sleep night by night, your averages, and how active each day was with VYBR8+.</p>
          <Link href="/pricing" className="vybe-gradient mx-auto inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">See VYBR8+</Link>
        </section>
      )}

      <section id="settings" aria-labelledby="set-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 id="set-h" className="font-bold">Sleep goal</h2>
        <form action={setSleepGoal} className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="hours">Hours of sleep per night</label>
          <input id="hours" name="hours" type="number" min={4} max={12} step={0.5} defaultValue={av.sleepGoal / 60} className={`${input} w-24`} />
          <span className="text-sm text-muted">hours a night</span>
          <Button type="submit" variant="ghost" className="ml-auto">Save</Button>
        </form>
        <p className="mt-2 text-xs text-faint">Your sleep and activity are private: never shared with friends, businesses or the VYBR8 Team. VYBR8 gives wellness information, not medical advice.</p>
      </section>
    </div>
  );
}
