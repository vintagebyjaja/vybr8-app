"use client";

import { useState } from "react";
import { ACTIVITY_LEVELS, ACTIVITY_OPTIONS, STEP_BANDS, type ActivityLevel, type StepBand } from "@/domain/health/health";

const TONE: Record<string, string> = {
  coral: "has-[:checked]:border-coral has-[:checked]:bg-coral/15",
  orange: "has-[:checked]:border-orange has-[:checked]:bg-orange/15",
  sky: "has-[:checked]:border-sky has-[:checked]:bg-sky/15",
  lavender: "has-[:checked]:border-lavender has-[:checked]:bg-lavender/15",
  mint: "has-[:checked]:border-mint has-[:checked]:bg-mint/15",
};
const chip = "cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm font-semibold has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-ink";

/** "How was your day?" Pick a level, then say what you did and (optionally) about how far you walked. */
export function CheckInForm({ action, date, initial }: {
  action: (f: FormData) => void | Promise<void>;
  date: string;
  initial: { level: ActivityLevel; activities: string[]; stepsBand: StepBand | null; miles: number | null; note: string | null } | null;
}) {
  const [level, setLevel] = useState<ActivityLevel | null>(initial?.level ?? null);
  const [measure, setMeasure] = useState<"steps" | "miles">(initial?.miles != null ? "miles" : "steps");
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <legend className="sr-only">How was your day?</legend>
        {ACTIVITY_LEVELS.map((l) => (
          <label key={l.key} className={`flex cursor-pointer flex-col rounded-2xl border border-line bg-ink p-3 ${TONE[l.tone]}`}>
            <input type="radio" name="level" value={l.key} required className="sr-only" defaultChecked={initial?.level === l.key} onChange={() => setLevel(l.key)} />
            <span className="font-bold">{l.label}</span>
            <span className="text-xs text-muted">{l.line}</span>
          </label>
        ))}
      </fieldset>

      {level && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">What did you do?</legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_OPTIONS.map((o) => (
                <label key={o.key} className={chip}>
                  <input type="checkbox" name="did" value={o.key} className="sr-only" defaultChecked={initial?.activities.includes(o.key)} />{o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">About how much did you walk? <span className="font-normal text-faint">(optional)</span></legend>
            <div className="flex gap-1 self-start rounded-full border border-line p-1 text-xs font-bold">
              {(["steps", "miles"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMeasure(m)} className={`rounded-full px-3 py-1 capitalize ${measure === m ? "bg-text text-ink" : "text-muted"}`}>{m}</button>
              ))}
            </div>
            {measure === "steps" ? (
              <div className="flex flex-wrap gap-2">
                {STEP_BANDS.map((b) => (
                  <label key={b.key} className={chip}>
                    <input type="radio" name="band" value={b.key} className="sr-only" defaultChecked={initial?.stepsBand === b.key} />{b.label}
                  </label>
                ))}
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input name="miles" inputMode="decimal" defaultValue={initial?.miles ?? ""} placeholder="2.5" className="min-h-11 w-28 rounded-xl border border-line bg-ink px-3 tabular-nums" /> miles
              </label>
            )}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-semibold">
            Anything else? <span className="font-normal text-faint">(optional)</span>
            <input name="note" maxLength={200} defaultValue={initial?.note ?? ""} placeholder="Leg day, 3 rounds of 2K, walked the Rail Trail…" className="min-h-11 rounded-xl border border-line bg-ink px-3 font-normal" />
          </label>

          <button className="vybe-gradient min-h-12 rounded-full font-bold text-ink hover:brightness-110">Save my day</button>
        </>
      )}
    </form>
  );
}
