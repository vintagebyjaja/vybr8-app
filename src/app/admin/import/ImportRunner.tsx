"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_IMPORT_LIMIT, tilesCenterOut } from "@/domain/places/osm";
import { importTile, type TileResult } from "./actions";

type Totals = { found: number; added: number; matched: number; known: number; skipped: number };
const ZERO: Totals = { found: 0, added: 0, matched: 0, known: 0, skipped: 0 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Walks a city tile by tile, downtown first, and stops once the limit of new places is reached.
 * "Import all cities" does every city that has no imported places yet, one after another.
 * Safe to stop and run again: nothing duplicates.
 */
export function ImportRunner({ cities, tileCount }: { cities: { slug: string; name: string; imported: number }[]; tileCount: number }) {
  const router = useRouter();
  const [city, setCity] = useState(cities.find((c) => c.imported === 0)?.slug ?? cities[0]?.slug ?? "");
  const [limit, setLimit] = useState(DEFAULT_IMPORT_LIMIT);
  const [running, setRunning] = useState<string | null>(null);   // the city being imported
  const [done, setDone] = useState(0);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [results, setResults] = useState<Record<string, number>>({});
  const [log, setLog] = useState<string[]>([]);
  const stop = useRef(false);
  const order = tilesCenterOut(Math.round(Math.sqrt(tileCount)));
  const nameOf = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 40));

  async function runCity(slug: string, cap: number): Promise<number> {
    setRunning(slug); setDone(0); setTotals(ZERO);
    let added = 0;
    for (let i = 0; i < order.length && !stop.current && added < cap; i++) {
      const t = order[i]!;
      let r: TileResult | null = null;
      for (let attempt = 0; attempt < 3 && !stop.current; attempt++) {
        try {
          r = await importTile(slug, t, cap - added);
        } catch {
          r = { found: 0, added: 0, matched: 0, known: 0, skipped: 0, errors: ["The server took too long on this part."], busy: true };
        }
        if (!r.busy) break;
        note(`${nameOf(slug)} part ${i + 1}: OpenStreetMap is busy, trying again…`);
        await wait(8000 * (attempt + 1));
      }
      if (r) {
        const res = r;
        added += res.added;
        setTotals((s) => ({ found: s.found + res.found, added: s.added + res.added, matched: s.matched + res.matched, known: s.known + res.known, skipped: s.skipped + res.skipped }));
        if (res.errors.length) res.errors.slice(0, 2).forEach((e) => note(`${nameOf(slug)} part ${i + 1}: ${e}`));
      }
      setDone(i + 1);
      await wait(1500);   // be kind to the free OpenStreetMap servers
    }
    setResults((m) => ({ ...m, [slug]: added }));
    note(stop.current ? `${nameOf(slug)}: stopped at ${added} new places.` : added >= cap ? `${nameOf(slug)}: reached the limit of ${cap} new places.` : `${nameOf(slug)}: done, ${added} new places.`);
    return added;
  }

  async function runOne() {
    stop.current = false; setResults({}); setLog([]);
    await runCity(city, limit);
    setRunning(null); router.refresh();
  }

  async function runAll() {
    stop.current = false; setResults({}); setLog([]);
    const todo = cities.filter((c) => c.imported === 0);
    if (!todo.length) { note("Every city already has imported places. Pick one city to add more."); return; }
    for (const c of todo) {
      if (stop.current) break;
      await runCity(c.slug, limit);
    }
    setRunning(null); router.refresh();
  }

  const pct = Math.round((done / order.length) * 100);
  const waiting = cities.filter((c) => c.imported === 0);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">City
          <select value={city} disabled={!!running} onChange={(e) => setCity(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal">
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.imported ? ` (${c.imported} imported)` : ""}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Max new places
          <input type="number" min={10} max={5000} step={10} value={limit} disabled={!!running} onChange={(e) => setLimit(Math.max(10, Math.min(5000, Number(e.target.value) || DEFAULT_IMPORT_LIMIT)))}
            className="min-h-11 w-28 rounded-xl border border-line bg-surface-2 px-3 font-normal tabular-nums" />
        </label>
        {running ? (
          <button type="button" onClick={() => { stop.current = true; }} className="min-h-11 rounded-full border border-line px-5 text-sm font-bold">Stop</button>
        ) : (
          <>
            <button type="button" onClick={runOne} className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-bold text-ink">Import this city</button>
            <button type="button" onClick={runAll} disabled={!waiting.length} className="min-h-11 rounded-full border border-mint/60 px-5 text-sm font-bold text-mint disabled:opacity-40">
              Import all cities ({waiting.length} left)
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-faint">
        Starts downtown and works outward, most complete places first (address, hours, website), and stops at the limit.
        &ldquo;Import all cities&rdquo; runs every city that has no imported places yet, one after another. Keep this page open while it runs.
      </p>

      {(running || done > 0) && (
        <>
          <p className="text-sm font-bold">{running ? `Importing ${nameOf(running)}…` : "Finished"}</p>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="vybe-gradient h-full transition-all" style={{ width: `${Math.max(pct, Math.min(100, Math.round((totals.added / limit) * 100)))}%` }} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {([["Added", `${totals.added} / ${limit}`, "text-mint"], ["Already on VYBR8", totals.matched + totals.known, "text-sky"], ["Found", totals.found, "text-text"], ["Skipped", totals.skipped, "text-faint"]] as const).map(([k, v, tone]) => (
              <div key={k} className="rounded-xl bg-ink p-3"><dd className={`font-display text-2xl font-extrabold tabular-nums ${tone}`}>{typeof v === "number" ? v.toLocaleString() : v}</dd><dt className="text-xs text-muted">{k}</dt></div>
            ))}
          </dl>
        </>
      )}
      {Object.keys(results).length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {Object.entries(results).map(([slug, n]) => <li key={slug} className="rounded-full bg-mint/15 px-3 py-1 font-bold text-mint">{nameOf(slug)}: {n} added</li>)}
        </ul>
      )}
      {log.length > 0 && <ul className="max-h-48 overflow-y-auto rounded-xl bg-ink p-3 text-xs text-muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </section>
  );
}
