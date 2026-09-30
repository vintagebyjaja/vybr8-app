import Link from "next/link";
import { CheckInForm } from "@/components/health/CheckInForm";
import { FoodLogForm } from "@/components/health/FoodLogForm";
import { RangeTabs } from "@/components/health/RangeTabs";
import { SleepBars } from "@/components/health/SleepBars";
import { MoonIcon, SleepGauge } from "@/components/health/SleepGauge";
import { Button } from "@/components/ui/Button";
import {
  ACTIVITY_LEVELS, ACTIVITY_OPTIONS, DAY_PARTS, FOOD_SLOTS, QUALITY_LABEL, RECOMMENDATIONS, STEP_BANDS, activityScore, addDays, blockAt, bodyHour, dayAdvice,
  dayLabel, formatClock, hhmm, isYmd, slotForHour, type DayPart, type Range,
} from "@/domain/health/health";
import { findCity } from "@/domain/map/map";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/entitlements";
import { getActiveVybe, getRhythm, nowFor } from "@/server/health";
import { getViewerCity } from "@/server/map";
import { checkIn, logFood, logSleep, removeFood } from "./actions";

export const metadata = { title: "Active Vybe" };

const TONE: Record<string, string> = { coral: "bg-coral/20 text-coral", orange: "bg-orange/20 text-orange", sky: "bg-sky/20 text-sky", mint: "bg-mint/20 text-mint", lavender: "bg-lavender/20 text-lavender" };
const SAVED: Record<string, string> = { sleep: "Sleep saved.", day: "Checked in. Nice.", food: "Food added.", drink: "Drink added.", water: "Water added. Stay hydrated." };
const KIND_DOT: Record<string, string> = { food: "bg-orange", drink: "bg-coral", water: "bg-sky" };
const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm tabular-nums placeholder:text-faint focus:border-lavender";

type Search = { searchParams: Promise<{ date?: string; range?: string; part?: string; e?: string; saved?: string }> };

export default async function HealthPage({ searchParams }: Search) {
  const viewer = await requireViewer("/health");
  const sp = await searchParams;
  const city = findCity(await getViewerCity(viewer));
  const rhythm = await getRhythm(viewer.id);
  const now = nowFor(rhythm, city.timezone);   // the person's own day: night-shift workers included
  const today = now.day;
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
  const nowSlot = isToday ? slotForHour(bodyHour(now.clock.minutes, rhythm.wake)) : null;
  const part: DayPart = DAY_PARTS.some((x) => x.key === sp.part) ? (sp.part as DayPart) : isToday ? now.part : "night";
  const partInfo = DAY_PARTS.find((x) => x.key === part)!;
  const greeting = DAY_PARTS.find((x) => x.key === now.part)!.greeting;
  const scheduledNow = isToday && part === now.part ? blockAt(rhythm.blocks, now.clock.weekday, now.clock.minutes) : null;
  const partCheckIn = av.checkins[part];
  const initial = partCheckIn ?? (scheduledNow ? { level: scheduledNow.level, activities: [], stepsBand: null, miles: null, note: null } : null);
  const levelLabel = (k: string | undefined) => ACTIVITY_LEVELS.find((l) => l.key === k)?.label;
  const partHref = (p: DayPart) => `/health?${new URLSearchParams({ date, part: p })}#day-h`;
  const bySlot = FOOD_SLOTS.map((s) => ({ ...s, items: av.journal.filter((j) => j.slot === s.key) })).filter((g) => g.items.length);
  const unslotted = av.journal.filter((j) => !j.slot);
  const href = (p: { date?: string; range?: string }) => `/health?${new URLSearchParams({ date: p.date ?? date, range: p.range ?? range })}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-lavender/20 text-lavender"><MoonIcon className="size-6" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-lavender">Active Vybe</p>
            <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{greeting}</h1>
            <p className="text-sm text-muted">On your time · {formatClock(hhmm(now.clock.minutes))} · private to you</p>
          </div>
        </div>
        <Link href="/health/schedule" aria-label="My schedule and reminders" className="grid size-11 place-items-center rounded-full border border-line text-muted hover:text-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
        </Link>
      </header>

      {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}
      {sp.saved && <p role="status" className="rounded-xl border border-lavender/40 bg-lavender/10 p-3 text-sm">{SAVED[sp.saved] ?? "Saved."}</p>}

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
                  <label className="flex flex-col gap-1 text-sm font-semibold">Went to bed<input type="time" name="bed" required defaultValue={av.sleep?.bedTime ?? rhythm.bed} className={input} /></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Woke up<input type="time" name="wake" required defaultValue={av.sleep?.wakeTime ?? rhythm.wake} className={input} /></label>
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

          {/* Check-ins: morning, midday, night */}
          <section aria-labelledby="day-h" className="flex scroll-mt-4 flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="day-h" className="font-display text-xl font-extrabold">{isToday ? (part === now.part ? partInfo.greeting : `${partInfo.label} check-in`) : `${partInfo.label} check-in`}</h2>
              {levelInfo && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${TONE[levelInfo.tone]}`}>Day: {levelInfo.label}</span>}
            </div>

            <nav aria-label="Part of the day" className="grid grid-cols-3 gap-2">
              {DAY_PARTS.map((x) => {
                const c = av.checkins[x.key];
                return (
                  <Link key={x.key} href={partHref(x.key)} aria-current={x.key === part ? "true" : undefined}
                    className={`flex flex-col items-center rounded-2xl border px-2 py-2 text-center ${x.key === part ? "border-lavender bg-lavender/15" : "border-line hover:bg-surface-2"}`}>
                    <span className="text-sm font-bold">{x.label}{isToday && x.key === now.part ? <span className="text-lavender"> · now</span> : null}</span>
                    <span className={`text-xs ${c ? "text-mint" : "text-faint"}`}>{c ? `✓ ${levelLabel(c.level)}` : "Not yet"}</span>
                  </Link>
                );
              })}
            </nav>

            {av.scheduled.length > 0 ? (
              <div className="rounded-2xl border border-line bg-ink p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-faint">On your schedule {isToday ? "today" : "this day"} · counted automatically</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {av.scheduled.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{b.label} <span className="font-normal text-muted">· {formatClock(b.start)}–{formatClock(b.end)}</span></span>
                      <span className="shrink-0 text-xs text-muted">{levelLabel(b.level)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Link href="/health/schedule" className="text-sm font-semibold text-sky hover:underline">Have a set schedule, like work 9–5? Add it once and it counts every day →</Link>
            )}

            {partCheckIn && (
              <p className="text-sm text-muted">
                {[
                  partCheckIn.activities.map((a) => ACTIVITY_OPTIONS.find((o) => o.key === a)?.label).filter(Boolean).join(", "),
                  partCheckIn.miles != null ? `${partCheckIn.miles} mi` : partCheckIn.stepsBand ? STEP_BANDS.find((b) => b.key === partCheckIn.stepsBand)?.label : null,
                  partCheckIn.note,
                ].filter(Boolean).join(" · ") || "Checked in."}
              </p>
            )}
            <details className="group" open={!partCheckIn}>
              <summary className="cursor-pointer list-none text-sm font-bold text-sky">
                {partCheckIn ? `Change ${partInfo.label.toLowerCase()} check-in` : scheduledNow ? `You're at ${scheduledNow.label} on your schedule. Anything else going on?` : partInfo.prompt}
              </summary>
              <div className="mt-3"><CheckInForm key={part} action={checkIn} date={date} part={part} initial={initial} /></div>
            </details>
          </section>

          {/* What you ate and drank */}
          <section aria-labelledby="ate-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="ate-h" className="font-display text-xl font-extrabold">{isToday ? "Have you already ate?" : "What you ate and drank"}</h2>
              <span className="shrink-0 rounded-full bg-sky/15 px-3 py-1 text-xs font-bold text-sky tabular-nums">{av.waterOz} oz water</span>
            </div>

            {isToday && nowSlot && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Quick water:</span>
                {[8, 16].map((oz) => (
                  <form key={oz} action={logFood}>
                    <input type="hidden" name="date" value={date} /><input type="hidden" name="kind" value="water" />
                    <input type="hidden" name="ounces" value={oz} /><input type="hidden" name="slot" value={nowSlot} />
                    <button className="min-h-10 rounded-full border border-sky/50 px-4 text-sm font-bold text-sky hover:bg-sky/10">+{oz} oz</button>
                  </form>
                ))}
              </div>
            )}

            {av.journal.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {[...bySlot, ...(unslotted.length ? [{ key: "other", label: "Other", items: unslotted }] : [])].map((g) => (
                  <li key={g.key}>
                    <p className="text-xs font-bold uppercase tracking-wider text-faint">{g.label}</p>
                    <ul className="mt-1 flex flex-col divide-y divide-line">
                      {g.items.map((j) => (
                        <li key={j.id} className="flex items-center gap-3 py-2">
                          <span aria-hidden className={`size-2 shrink-0 rounded-full ${KIND_DOT[j.kind] ?? "bg-orange"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{j.name}</p>
                            <p className="text-xs text-muted tabular-nums">
                              {[j.amount, j.ounces != null ? `${j.ounces} oz` : null, j.kind !== "water" && j.calories != null ? `${j.calories.toLocaleString()} cal` : null, j.fromMenu ? "from a VYBR8 menu" : null]
                                .filter(Boolean).join(" · ") || (j.kind === "drink" ? "Drink" : "Food")}
                            </p>
                          </div>
                          <form action={removeFood}>
                            <input type="hidden" name="id" value={j.id} /><input type="hidden" name="date" value={date} />
                            <button aria-label={`Remove ${j.name}`} className="grid size-9 place-items-center rounded-full text-lg text-faint hover:bg-surface-2 hover:text-text">×</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nothing logged {isToday ? "yet today" : "for this day"}. Add water, a drink or food and when you had it.</p>
            )}

            <details className="group rounded-2xl border border-line bg-ink p-4" open={av.journal.length === 0}>
              <summary className="cursor-pointer list-none text-center font-bold text-mint">+ Add food or a drink</summary>
              <div className="mt-4"><FoodLogForm action={logFood} date={date} slot={nowSlot} /></div>
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
            {!calTarget && <p className="text-xs text-faint">Add what you ate above, or log from a dish page or your Vybe Plan. Calorie and macro targets are part of VYBR8+.</p>}
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

      <section id="settings" aria-labelledby="set-h" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="set-h" className="font-bold">My schedule &amp; reminders</h2>
            <p className="text-sm text-muted tabular-nums">Up at {formatClock(rhythm.wake)} · bed at {formatClock(rhythm.bed)} · {rhythm.blocks.length} {rhythm.blocks.length === 1 ? "block" : "blocks"} · {rhythm.reminders.length ? `${rhythm.reminders.length} reminders` : "reminders off"}</p>
          </div>
          <Link href="/health/schedule" className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line px-4 text-sm font-bold hover:bg-surface-2">Edit</Link>
        </div>
        <p className="text-xs text-faint">Your sleep, activity and what you eat and drink are private: never shared with friends, businesses or the VYBR8 Team. VYBR8 gives wellness information, not medical advice.</p>
      </section>
    </div>
  );
}
