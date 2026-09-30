import Link from "next/link";
import { SLOT_LABEL, addDays, dayLabel, formatClock, isYmd, ymdIn, type DayType } from "@/domain/health/health";
import { findCity } from "@/domain/map/map";
import { NUTRITION_SOURCE_LABEL, type NutritionSource } from "@/domain/nutrition/nutrition";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/entitlements";
import { getVybePlan } from "@/server/health";
import { getViewerCity } from "@/server/map";
import { eatMeal, removeMeal, suggestPlan } from "../actions";

export const metadata = { title: "Your Vybe Plan" };

const DAY_TYPES: { key: DayType; label: string }[] = [
  { key: "high_energy", label: "High Energy Day" },
  { key: "rest", label: "Rest Day" },
  { key: "custom", label: "Balanced" },
];
const SLOT_TONE: Record<string, string> = { breakfast: "text-mint", lunch: "text-mint", pre_workout: "text-coral", snack: "text-orange", dinner: "text-mint" };

type Search = { searchParams: Promise<{ day?: string; type?: string; e?: string }> };

export default async function VybePlanPage({ searchParams }: Search) {
  const viewer = await requireViewer("/health/plan");
  const sp = await searchParams;
  const city = findCity(await getViewerCity(viewer));
  const today = ymdIn(city.timezone);
  const day = isYmd(sp.day) && sp.day >= addDays(today, -1) && sp.day <= addDays(today, 14) ? sp.day : today;
  const [allowed, plan] = await Promise.all([can("meal_planning"), getVybePlan(viewer.id, day)]);
  const suggestedType = (DAY_TYPES.some((t) => t.key === sp.type) ? sp.type : plan.dayType) as DayType;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const totals = plan.items.reduce((a, i) => ({ cal: a.cal + (i.calories ?? 0), protein: a.protein + (i.protein ?? 0) }), { cal: 0, protein: 0 });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <Link href={`/health?date=${day <= today ? day : today}`} className="text-sm text-muted hover:text-text">← Active Vybe</Link>
      <header>
        <h1 className="font-display text-3xl font-extrabold">Your Vybe Plan</h1>
        <p className="text-sm text-muted">Real dishes from places in {city.name}, sized to your goals, activity and schedule.</p>
      </header>

      {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}

      <nav aria-label="Day" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {week.map((d) => {
          const l = dayLabel(d);
          return (
            <Link key={d} href={`/health/plan?day=${d}`} aria-current={d === day ? "page" : undefined}
              className={`flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2 ${d === day ? "border-coral bg-coral/80 text-ink" : "border-line text-muted hover:text-text"}`}>
              <span className="text-sm font-semibold">{l.weekday}</span>
              <span className="font-display text-xl font-extrabold">{l.day}</span>
            </Link>
          );
        })}
      </nav>

      {!allowed ? (
        <section className="flex flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">VYBR8 MAX</p>
          <p className="font-display text-2xl font-extrabold">Let VYBR8 plan your day of eating</p>
          <p className="text-sm text-muted">Breakfast to dinner from real menus near you, sized to your calorie and protein targets, and adjusted for high-energy and rest days. Tap a meal when you eat it and it&rsquo;s logged.</p>
          <Link href="/pricing" className="vybe-gradient mx-auto inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Get VYBR8 MAX</Link>
        </section>
      ) : (
        <>
          {plan.items.length === 0 ? (
            <section className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center">
              <p className="font-display text-xl font-extrabold">No plan for {day === today ? "today" : dayLabel(day).long} yet</p>
              <p className="mt-1 text-sm text-muted">Pick the kind of day below and VYBR8 builds it from places near you.</p>
            </section>
          ) : (
            <>
              <ol className="flex flex-col gap-3">
                {plan.items.map((i) => (
                  <li key={i.id} className={`relative flex overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface ${i.eaten ? "opacity-60" : ""}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-4">
                      <p className={`text-sm font-bold ${SLOT_TONE[i.slot] ?? "text-mint"}`}>{formatClock(i.atTime)}</p>
                      <p className="font-display text-lg font-extrabold leading-tight">{SLOT_LABEL[i.slot] ?? i.slot}</p>
                      <p className="truncate text-sm">{i.name}</p>
                      {i.place && <Link href={`/venue/${i.place.slug}`} className="truncate text-xs text-sky hover:underline">{i.place.name}</Link>}
                      <p className="text-sm text-muted tabular-nums">
                        {i.calories != null ? `${i.calories.toLocaleString()} cal` : "Calories unknown"}{i.protein != null ? ` · ${Math.round(i.protein)}g protein` : ""}
                      </p>
                      <p className="text-[10px] font-bold tracking-wider text-faint">{NUTRITION_SOURCE_LABEL[i.source as NutritionSource] ?? "UNKNOWN"}</p>
                      <div className="mt-2 flex gap-2">
                        {i.eaten ? (
                          <span className="rounded-full bg-mint/20 px-3 py-1 text-xs font-bold text-mint">Eaten · logged</span>
                        ) : (
                          <>
                            <form action={eatMeal}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="day" value={day} />
                              <button className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-ink">I ate this</button></form>
                            <form action={removeMeal}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="day" value={day} />
                              <button className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted hover:text-text">Remove</button></form>
                          </>
                        )}
                      </div>
                    </div>
                    {i.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed post photo
                      <img src={i.photo} alt="" className="w-32 shrink-0 object-cover sm:w-40" />
                    ) : (
                      <div aria-hidden className="vybe-gradient grid w-32 shrink-0 place-items-center opacity-80 sm:w-40">
                        <span className="font-display text-4xl font-extrabold text-ink/70">{(SLOT_LABEL[i.slot] ?? "M").slice(0, 1)}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <p className="text-center text-sm text-muted tabular-nums">Planned: {totals.cal.toLocaleString()} cal · {Math.round(totals.protein)}g protein</p>
            </>
          )}

          <section aria-labelledby="adj-h" className="flex flex-col gap-3">
            <h2 id="adj-h" className="font-bold">{plan.items.length ? "Adjust Plan" : "Build my plan"}</h2>
            <div className="flex flex-wrap gap-2">
              {DAY_TYPES.map((t) => (
                <form key={t.key} action={suggestPlan}>
                  <input type="hidden" name="day" value={day} />
                  <input type="hidden" name="type" value={t.key} />
                  <input type="hidden" name="city" value={city.slug} />
                  <button className={`min-h-11 rounded-full px-5 text-sm font-bold ${t.key === suggestedType ? "bg-text text-ink" : "border border-line hover:bg-surface-2"}`}>{t.label}</button>
                </form>
              ))}
            </div>
            <p className="text-xs text-faint">
              Built from dishes with known calories (verified, restaurant-provided, database or VYBR8 estimates, always labeled). No alcohol in plans.
              Wellness information, not medical advice.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
