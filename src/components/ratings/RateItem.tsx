"use client";

import { useState } from "react";
import { rateItem } from "@/app/(app)/ratings/actions";

/** Rate one dish or drink, 0–10 (free, always). */
export function RateItem({ itemId, itemName, myScore, returnTo }: { itemId: string; itemName: string; myScore: number | null; returnTo: string }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(myScore ?? 8);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:bg-surface-2">
        {myScore != null ? `You: ${myScore.toFixed(1)}` : "Rate it"}
      </button>
    );
  }
  return (
    <form action={async (f) => { await rateItem(f); setOpen(false); }} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-ink p-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor={`score-${itemId}`}>Your score for {itemName}</label>
      <input id={`score-${itemId}`} name="score" type="range" min={0} max={10} step={0.1} value={score} onChange={(e) => setScore(Number(e.target.value))} className="flex-1 accent-coral" />
      <output className="vybe-text w-10 text-right font-display font-extrabold tabular-nums">{score.toFixed(1)}</output>
      <button className="vybe-gradient min-h-9 rounded-full px-3 text-xs font-bold text-ink">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-xs text-muted">Cancel</button>
    </form>
  );
}
