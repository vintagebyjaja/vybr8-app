"use client";

import { useState } from "react";
import { clearVybeStatus, setVybeStatus } from "@/app/(app)/map-actions";

const INTENTS = [
  { key: "eat", label: "Eat", tone: "text-orange" },
  { key: "drink", label: "Drink", tone: "text-coral" },
  { key: "link_up", label: "Link Up", tone: "text-sky" },
] as const;

/** "What's your vybe?": tell your friends you're looking for a meal, a drink or a link up. */
export function VybeStatus({
  city,
  mine,
  canDrink,
}: {
  city: string;
  mine: { intent: "eat" | "drink" | "link_up"; note: string | null; expiresAt: string } | null;
  canDrink: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (mine && !editing) {
    const until = new Date(mine.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <p className="text-sm">
          Your friends see you want to <b className="vybe-text">{INTENTS.find((i) => i.key === mine.intent)?.label.toLowerCase()}</b>
          {mine.note ? <> · &ldquo;{mine.note}&rdquo;</> : null} <span className="text-faint">until {until}</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="min-h-9 rounded-full border border-line px-4 text-sm font-semibold">Change</button>
          <form action={clearVybeStatus}><button className="min-h-9 rounded-full px-4 text-sm font-semibold text-muted hover:text-text">Clear</button></form>
        </div>
      </div>
    );
  }

  return (
    <form
      action={async (f) => { await setVybeStatus(f); setEditing(false); }}
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <input type="hidden" name="city" value={city} />
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2 text-sm font-semibold">What&rsquo;s your vybe? <span className="font-normal text-faint">Only your friends see this.</span></legend>
        {INTENTS.map((i, n) => (
          <label key={i.key} className="cursor-pointer">
            <input type="radio" name="intent" value={i.key} defaultChecked={mine ? mine.intent === i.key : n === 0} className="peer sr-only" />
            <span className={`inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-bold ${i.tone} peer-checked:border-transparent peer-checked:bg-surface-2 peer-checked:ring-2 peer-checked:ring-coral peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky`}>
              {i.label}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <input name="note" maxLength={140} defaultValue={mine?.note ?? ""} placeholder={canDrink ? "Wings anyone? Rooftop after work?" : "Wings anyone? Matcha run?"} aria-label="Add a note" className="min-h-11 flex-1 rounded-xl border border-line bg-ink px-3 text-sm placeholder:text-faint" />
        <select name="hours" defaultValue="3" aria-label="For how long" className="min-h-11 rounded-xl border border-line bg-ink px-3 text-sm">
          <option value="1">1 hour</option>
          <option value="3">3 hours</option>
          <option value="6">6 hours</option>
          <option value="12">12 hours</option>
        </select>
        <button className="vybe-gradient min-h-11 rounded-full px-5 text-sm font-bold text-ink">Share with friends</button>
      </div>
    </form>
  );
}
