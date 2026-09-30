"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importTile, type TileResult } from "./actions";

type Totals = { found: number; added: number; matched: number; known: number; skipped: number };
const ZERO: Totals = { found: 0, added: 0, matched: 0, known: 0, skipped: 0 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walks a city tile by tile so each request stays quick. Safe to stop and run again: nothing duplicates. */
export function ImportRunner({ cities, tileCount }: { cities: { slug: string; name: string }[]; tileCount: number }) {
  const router = useRouter();
  const [city, setCity] = useState(cities[0]?.slug ?? "");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [log, setLog] = useState<string[]>([]);
  const stop = useRef(false);

  async function run() {
    stop.current = false;
    setRunning(true); setDone(0); setTotals(ZERO); setLog([]);
    const name = cities.find((c) => c.slug === city)?.name ?? city;
    for (let t = 0; t < tileCount && !stop.current; t++) {
      let r: TileResult | null = null;
      for (let attempt = 0; attempt < 3 && !stop.current; attempt++) {
        try {
          r = await importTile(city, t);
        } catch {
          r = { found: 0, added: 0, matched: 0, known: 0, skipped: 0, errors: ["The server took too long on this part."], busy: true };
        }
        if (!r.busy) break;
        setLog((l) => [`Part ${t + 1}: OpenStreetMap is busy, trying again…`, ...l]);
        await wait(8000 * (attempt + 1));
      }
      if (r) {
        const res = r;
        setTotals((s) => ({ found: s.found + res.found, added: s.added + res.added, matched: s.matched + res.matched, known: s.known + res.known, skipped: s.skipped + res.skipped }));
        if (res.errors.length) setLog((l) => [...res.errors.slice(0, 3).map((e) => `Part ${t + 1}: ${e}`), ...l].slice(0, 30));
      }
      setDone(t + 1);
      await wait(1500);   // be kind to the free OpenStreetMap servers
    }
    setLog((l) => [stop.current ? `Stopped. You can run ${name} again any time: nothing duplicates.` : `${name} is done.`, ...l]);
    setRunning(false);
    router.refresh();
  }

  const pct = Math.round((done / tileCount) * 100);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">City
          <select value={city} disabled={running} onChange={(e) => setCity(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal">
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        {running ? (
          <button type="button" onClick={() => { stop.current = true; }} className="min-h-11 rounded-full border border-line px-5 text-sm font-bold">Stop</button>
        ) : (
          <button type="button" onClick={run} className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-bold text-ink">Import real places</button>
        )}
      </div>

      {(running || done > 0) && (
        <>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="vybe-gradient h-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted tabular-nums">Part {done} of {tileCount} · {pct}%</p>
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {([["Added", totals.added, "text-mint"], ["Already on VYBR8", totals.matched + totals.known, "text-sky"], ["Found", totals.found, "text-text"], ["Skipped", totals.skipped, "text-faint"]] as const).map(([k, v, tone]) => (
              <div key={k} className="rounded-xl bg-ink p-3"><dd className={`font-display text-2xl font-extrabold tabular-nums ${tone}`}>{v.toLocaleString()}</dd><dt className="text-xs text-muted">{k}</dt></div>
            ))}
          </dl>
        </>
      )}
      {log.length > 0 && <ul className="max-h-48 overflow-y-auto rounded-xl bg-ink p-3 text-xs text-muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </section>
  );
}
