"use client";

import Link from "next/link";
import { useState } from "react";
import { StreetMap, type StreetPin } from "@/components/map/StreetMap";
import { project, type City } from "@/domain/map/map";

export type CravePin = {
  key: string; lat: number; lng: number; emoji: string;
  title: string; subtitle: string; score: string | null; price: string | null; distance: string | null; href: string;
};

/** CRAVE MAP: pins are places where the craving can be satisfied; tap one for the dish preview. */
export function CraveMap({ city, pins, mapboxToken }: { city: City; pins: CravePin[]; mapboxToken?: string | null }) {
  const [active, setActive] = useState<string | null>(pins[0]?.key ?? null);
  const [street, setStreet] = useState(!!mapboxToken);
  const current = pins.find((p) => p.key === active) ?? null;

  const dot = (p: CravePin) => (
    <button type="button" onClick={() => setActive(p.key)} aria-label={`${p.title} at ${p.subtitle}`}
      className={`grid size-10 place-items-center rounded-full border-2 text-lg shadow-lg transition ${p.key === active ? "scale-125 border-text bg-coral" : "border-ink bg-surface-2 hover:scale-110"}`}>
      <span aria-hidden>{p.emoji}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[60vh] min-h-80 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {street && mapboxToken ? (
          <StreetMap token={mapboxToken} bounds={city.bounds} onFail={() => setStreet(false)}
            pins={pins.map((p): StreetPin => ({ key: p.key, lat: p.lat, lng: p.lng, node: dot(p), z: p.key === active ? 10 : 1 }))} />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,var(--color-surface-2),var(--color-ink))]">
            {pins.map((p) => {
              const { x, y } = project(p.lat, p.lng, city.bounds);
              return <span key={p.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%`, zIndex: p.key === active ? 10 : 1 }}>{dot(p)}</span>;
            })}
          </div>
        )}
        {!pins.length && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">Nothing to pin yet for this craving here.</p>}
      </div>
      {current && (
        <Link href={current.href} className="flex items-center gap-3 rounded-2xl border border-coral/40 bg-surface p-4 hover:bg-surface-2">
          <span aria-hidden className="text-3xl">{current.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{current.title}</span>
            <span className="block truncate text-sm text-muted">{current.subtitle}</span>
          </span>
          <span className="shrink-0 text-right text-sm">
            {current.score && <b className="block tabular-nums">{current.score}</b>}
            <span className="text-muted">{[current.price, current.distance].filter(Boolean).join(" · ")}</span>
          </span>
        </Link>
      )}
    </div>
  );
}
