import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ACTIVITY_LEVELS, DAY_PARTS, WEEKDAYS, daysLabel, formatClock, sleepMinutes, formatDuration } from "@/domain/health/health";
import { requireViewer } from "@/server/auth";
import { getRhythm } from "@/server/health";
import { addBlock, removeBlock, saveRhythm } from "../actions";

export const metadata = { title: "My Vybe Schedule" };

const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm tabular-nums placeholder:text-faint focus:border-lavender";
const chip = "cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm font-semibold has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-ink";
const PRESETS = [
  { label: "Day person", wake: "07:00", bed: "23:00" },
  { label: "Early bird", wake: "05:00", bed: "21:30" },
  { label: "Night owl", wake: "10:00", bed: "02:00" },
  { label: "Night shift", wake: "15:00", bed: "07:00" },
];
const IDEAS = ["Work", "School", "Gym", "Commute", "Practice", "Gaming"];

type Search = { searchParams: Promise<{ e?: string; saved?: string }> };

export default async function SchedulePage({ searchParams }: Search) {
  const viewer = await requireViewer("/health/schedule");
  const sp = await searchParams;
  const r = await getRhythm(viewer.id);
  const level = (k: string) => ACTIVITY_LEVELS.find((l) => l.key === k)?.label ?? k;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">My Vybe Schedule</h1>
        <p className="text-sm text-muted">Set it once. Active Vybe follows your day, whether you work 9–5 or the night shift, and your regular plans count on their own.</p>
      </header>

      {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}
      {sp.saved && <p role="status" className="rounded-xl border border-lavender/40 bg-lavender/10 p-3 text-sm">{sp.saved === "block" ? "Added to your schedule." : "Saved. Active Vybe is on your time now."}</p>}

      {/* Rhythm & reminders */}
      <section aria-labelledby="rhythm-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div>
          <h2 id="rhythm-h" className="font-display text-xl font-extrabold">Your day</h2>
          <p className="text-sm text-muted">Your morning starts when you wake up, even if that&rsquo;s 3 PM.</p>
        </div>
        <form action={saveRhythm} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">I usually wake up<input type="time" name="wake" required defaultValue={r.wake} className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">I usually go to bed<input type="time" name="bed" required defaultValue={r.bed} className={input} /></label>
          </div>
          <p className="-mt-2 text-xs text-faint">That&rsquo;s about {formatDuration(sleepMinutes(r.bed, r.wake))} of sleep. Common starting points: {PRESETS.map((p) => `${p.label} (${formatClock(p.wake)}–${formatClock(p.bed)})`).join(" · ")}</p>

          <label className="flex items-center gap-2 text-sm font-semibold">
            Sleep goal
            <input name="hours" type="number" min={4} max={12} step={0.5} defaultValue={r.sleepGoal / 60} className={`${input} w-24`} />
            <span className="font-normal text-muted">hours</span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Check-in reminders <span className="font-normal text-faint">(in your Alerts)</span></legend>
            {DAY_PARTS.map((p) => (
              <label key={p.key} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-ink p-3 has-[:checked]:border-lavender">
                <input type="checkbox" name="remind" value={p.key} defaultChecked={r.reminders.includes(p.key)} className="size-5 accent-[var(--color-lavender)]" />
                <span><span className="block font-bold">{p.greeting}</span><span className="text-xs text-muted">{p.label}: {p.prompt}</span></span>
              </label>
            ))}
          </fieldset>
          <Button type="submit">Save my day</Button>
        </form>
      </section>

      {/* Repeating blocks */}
      <section aria-labelledby="blocks-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div>
          <h2 id="blocks-h" className="font-display text-xl font-extrabold">Regular plans</h2>
          <p className="text-sm text-muted">Work, school, the gym. They count toward your day automatically, so you only check in what&rsquo;s different.</p>
        </div>

        {r.blocks.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {r.blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{b.label}</p>
                  <p className="text-xs text-muted tabular-nums">{daysLabel(b.days)} · {formatClock(b.start)}–{formatClock(b.end)}{b.end < b.start ? " (overnight)" : ""} · {level(b.level)}</p>
                </div>
                <form action={removeBlock}>
                  <input type="hidden" name="id" value={b.id} />
                  <button aria-label={`Remove ${b.label}`} className="grid size-9 place-items-center rounded-full text-lg text-faint hover:bg-surface-2 hover:text-text">×</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-faint">Nothing yet.</p>
        )}

        <details className="rounded-2xl border border-line bg-ink p-4" open={r.blocks.length === 0}>
          <summary className="cursor-pointer list-none text-center font-bold text-mint">+ Add a regular plan</summary>
          <form action={addBlock} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-semibold">What is it?
              <input name="label" required maxLength={40} list="block-ideas" placeholder="Work" className={input} />
              <datalist id="block-ideas">{IDEAS.map((i) => <option key={i} value={i} />)}</datalist>
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Which days?</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className={chip}><input type="checkbox" name="days" value={i} defaultChecked={i >= 1 && i <= 5} className="sr-only" />{d}</label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">From<input type="time" name="start" required defaultValue="09:00" className={input} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">To<input type="time" name="end" required defaultValue="17:00" className={input} /></label>
            </div>
            <p className="-mt-2 text-xs text-faint">Ends before it starts? We&rsquo;ll treat it as overnight, like a 10 PM – 6 AM shift.</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">What are you usually doing?</legend>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_LEVELS.map((l) => (
                  <label key={l.key} className={chip}><input type="radio" name="level" value={l.key} required defaultChecked={l.key === "sitting"} className="sr-only" />{l.label}</label>
                ))}
              </div>
            </fieldset>
            <Button type="submit">Add to my schedule</Button>
          </form>
        </details>
      </section>

      <Link href="/health" className="text-center text-sm font-semibold text-sky hover:underline">Back to Active Vybe</Link>
    </div>
  );
}
