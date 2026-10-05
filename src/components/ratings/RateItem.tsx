"use client";

import { useState } from "react";
import { rateItem } from "@/app/(app)/ratings/actions";

/** Rate one dish or drink, 0–10 (free, always). Each visit can be its own rating (one per day). */
export function RateItem({ itemId, itemName, myScore, myCount = 0, myAvg = null, ratedToday = false, returnTo }: {
  itemId: string; itemName: string; myScore: number | null; myCount?: number; myAvg?: number | null; ratedToday?: boolean; returnTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(myScore ?? 8);
  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:bg-surface-2">
          {myScore == null ? "Rate it" : ratedToday ? `Today: ${myScore.toFixed(1)}` : "Rate again"}
        </button>
        {myCount > 1 && myAvg != null && (
          <span className="text-xs text-muted tabular-nums">You&rsquo;ve rated it {myCount}× · your avg {myAvg.toFixed(1)}</span>
        )}
        {myCount === 1 && !ratedToday && myScore != null && <span className="text-xs text-muted tabular-nums">Last time: {myScore.toFixed(1)}</span>}
      </span>
    );
  }
  return (
    <form action={async (f) => { await rateItem(f); setOpen(false); }} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-ink p-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor={`score-${itemId}`}>Your score for {itemName}</label>
      <input id={`score-${itemId}`} name="score" type="range" min={0} max={10} step={0.1} value={score} onChange={(e) => setScore(Number(e.target.value))} className="flex-1 accent-coral" />
      <output className="vybe-text w-10 text-right font-display font-extrabold tabular-nums">{score.toFixed(1)}</output>
      <button className="vybe-gradient min-h-9 rounded-full px-3 text-xs font-bold text-ink">{myScore != null && !ratedToday ? "Save this visit" : "Save"}</button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-xs text-muted">Cancel</button>
    </form>
  );
}
