"use client";

import { useState } from "react";
import { ratePlace } from "@/app/(app)/ratings/actions";

const DIMS = [
  { key: "overall", label: "Overall", required: true },
  { key: "service_vybe", label: "Service Vybe" },
  { key: "value", label: "Value" },
  { key: "aesthetic", label: "Aesthetic" },
] as const;

/** Rate the place itself: overall experience, Service Vybe, value, aesthetic. */
export function RatePlace({ businessId, returnTo, label = "Rate this place" }: { businessId: string; returnTo: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, number | null>>({ overall: 8, service_vybe: null, value: null, aesthetic: null });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="min-h-10 rounded-full border border-line px-4 text-sm font-bold hover:bg-surface-2">{label}</button>;
  return (
    <form action={async (f) => { await ratePlace(f); setOpen(false); }} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {DIMS.map((d) => (
        <div key={d.key} className="flex items-center gap-3">
          <label htmlFor={`pr-${d.key}`} className="w-28 text-sm font-semibold">{d.label}</label>
          {vals[d.key] == null ? (
            <button type="button" onClick={() => setVals({ ...vals, [d.key]: 8 })} className="text-xs font-semibold text-sky">Add</button>
          ) : (
            <>
              <input id={`pr-${d.key}`} name={d.key} type="range" min={0} max={10} step={0.1} value={vals[d.key]!} onChange={(e) => setVals({ ...vals, [d.key]: Number(e.target.value) })} className="flex-1 accent-coral" />
              <output className="w-10 text-right font-display font-bold tabular-nums">{vals[d.key]!.toFixed(1)}</output>
            </>
          )}
        </div>
      ))}
      <textarea name="note" maxLength={1000} rows={2} placeholder="Anything people should know? (optional)" aria-label="Note" className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button className="vybe-gradient min-h-10 rounded-full px-5 text-sm font-bold text-ink">Save rating</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 px-3 text-sm text-muted">Cancel</button>
      </div>
    </form>
  );
}
