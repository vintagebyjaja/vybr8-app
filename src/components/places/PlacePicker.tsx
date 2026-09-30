"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PickedPlace } from "@/domain/places/places";

export type { PickedPlace };

/**
 * Type-to-search place picker. Works with thousands of places: it asks the server for matches instead of
 * loading every place into a dropdown. Puts the chosen place's id or slug in a hidden input called `name`.
 */
export function PlacePicker({
  name, valueKey = "id", city, initial = null, placeholder = "Search places by name", label, required = false, onChange, className = "",
}: {
  name?: string;
  valueKey?: "id" | "slug";
  city?: string;
  initial?: PickedPlace | null;
  placeholder?: string;
  label?: string;
  required?: boolean;
  onChange?: (p: PickedPlace | null) => void;
  className?: string;
}) {
  const id = useId();
  const [picked, setPicked] = useState<PickedPlace | null>(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCity = useRef(city);

  // Changing the city clears a pick from another city.
  useEffect(() => {
    if (lastCity.current !== city) {
      lastCity.current = city;
      if (picked?.city && city && picked.city !== city) { setPicked(null); onChange?.(null); }
    }
  }, [city, picked, onChange]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?${new URLSearchParams({ q, ...(city ? { city } : {}) })}`, { signal: ctl.signal });
        const json = (await res.json()) as { places: PickedPlace[] };
        setHits(json.places); setActive(0); setOpen(true);
      } catch { /* typing again cancels the last search */ }
      finally { setLoading(false); }
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, city]);

  function choose(p: PickedPlace | null) {
    setPicked(p); setOpen(false); setQ(""); setHits([]);
    onChange?.(p);
    if (!p) setTimeout(() => inputRef.current?.focus(), 0);
  }

  const where = (p: PickedPlace) => [p.branch, p.address].filter(Boolean).join(" · ");
  const box = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-text placeholder:text-faint focus:border-sky";

  return (
    <div className={`relative flex flex-col gap-1.5 ${className}`}>
      {label && <label htmlFor={id} className="text-sm font-semibold">{label}</label>}
      {name && <input type="hidden" name={name} value={picked ? picked[valueKey] : ""} />}
      {picked ? (
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-sky/50 bg-surface px-3 py-1.5">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{picked.name}</span>
            {where(picked) && <span className="block truncate text-xs text-muted">{where(picked)}</span>}
          </span>
          <button type="button" onClick={() => choose(null)} className="shrink-0 rounded-full px-3 py-1 text-xs font-bold text-sky hover:bg-surface-2">Change</button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef} id={id} value={q} autoComplete="off" placeholder={placeholder} className={box}
            required={required && !picked}
            role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
            aria-activedescendant={open && hits[active] ? `${id}-${active}` : undefined}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => hits.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && open && hits[active]) { e.preventDefault(); choose(hits[active]!); }
              else if (e.key === "Escape") setOpen(false);
            }}
          />
          {open && q.trim().length >= 2 && (
            <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface-2 p-1 shadow-xl">
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">{loading ? "Searching…" : "No places match. Try another spelling."}</li>
              ) : hits.map((p, i) => (
                <li key={p.id} id={`${id}-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer rounded-lg px-3 py-2 ${i === active ? "bg-surface" : ""}`}>
                  <span className="block truncate text-sm font-semibold">{p.name}{p.approved ? <span className="text-mint"> ✓</span> : null}</span>
                  {where(p) && <span className="block truncate text-xs text-muted">{where(p)}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
