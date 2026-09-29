"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { setCity } from "@/app/(app)/map-actions";
import { StreetMap, type StreetPin } from "@/components/map/StreetMap";
import { ApprovedBadge } from "@/components/places/ApprovedBadge";
import type { MapData, MapFriend, MapLinkup, MapTruck, MapVenue } from "@/domain/map/pins";
import { OCCASIONS, type Occasion } from "@/domain/linkups/linkups";

type Filter = "all" | "open" | "food" | "drinks" | "trucks" | "linkups" | "friends";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open now" },
  { key: "food", label: "Food" },
  { key: "drinks", label: "Drinks" },
  { key: "trucks", label: "Food trucks" },
  { key: "linkups", label: "Link Ups" },
  { key: "friends", label: "Friends" },
];
// "Drinks" includes coffee, tea, matcha, boba, lemonade and smoothie spots (all ages) as well as bars (21+ content only).
const DRINK_KINDS = new Set(["cafe", "tea_shop", "juice_bar", "bar", "cocktail_lounge", "lounge", "hookah_lounge", "cigar_lounge", "brewery", "nightlife"]);
const WAVE_COLORS = ["#ffb27a", "#ff8193", "#9fd2ff", "#94e3b8", "#c6afff"];
const INTENT_LABEL = { eat: "Eat", drink: "Drink", link_up: "Link Up" } as const;

type Selected = { type: "venue"; v: MapVenue } | { type: "linkup"; l: MapLinkup } | { type: "friend"; f: MapFriend } | { type: "truck"; t: MapTruck } | null;

/**
 * The Vybe Map: the VYBR8 frequency drawn as a living contour map of the city.
 * Waves bend around busy spots; pins sit at each place's real coordinates.
 */
export function VybeMap({ data, cities, mapboxToken }: { data: MapData; cities: { slug: string; name: string }[]; mapboxToken?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Street map when a Mapbox token is set; the frequency map is the fallback (no token, or Mapbox fails to load).
  const [street, setStreet] = useState(!!mapboxToken);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Selected>(null);
  const [pending, start] = useTransition();

  const venues = useMemo(
    () =>
      data.venues.filter((v) =>
        filter === "open" ? v.openNow === true : filter === "food" ? !DRINK_KINDS.has(v.kind) : filter === "drinks" ? DRINK_KINDS.has(v.kind) : filter === "all",
      ),
    [data.venues, filter],
  );
  const linkups = filter === "all" || filter === "linkups" ? data.linkups : [];
  const friends = filter === "all" || filter === "friends" ? data.friends.filter((f) => f.x !== null) : [];
  // Trucks only appear while they're actually here (the server already filtered to "here now").
  const allTrucks = data.trucks ?? [];
  const trucks = filter === "all" || filter === "trucks" || filter === "open" || filter === "food" ? allTrucks : [];

  // Hotspots bend the frequency lines: busier places pull harder.
  const hotspots = useMemo(
    () => [
      ...data.venues.map((v) => ({ x: v.x / 100, y: v.y / 100, w: v.openNow ? 1 : 0.5 })),
      ...data.linkups.map((l) => ({ x: l.x / 100, y: l.y / 100, w: 1.2 })),
      ...data.friends.filter((f) => f.x !== null).map((f) => ({ x: f.x! / 100, y: f.y! / 100, w: 0.8 })),
      ...(data.trucks ?? []).map((t) => ({ x: t.x / 100, y: t.y / 100, w: 0.9 })),
    ],
    [data],
  );

  useEffect(() => {
    if (street) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const LINES = 22;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < LINES; i++) {
        const base = ((i + 0.5) / LINES) * h;
        const color = WAVE_COLORS[i % WAVE_COLORS.length]!;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.18 + (i % 5 === 0 ? 0.12 : 0);
        ctx.lineWidth = i % 5 === 0 ? 1.6 : 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const u = x / w, v = base / h;
          let dy = Math.sin(u * 7 + t * 0.4 + i * 0.6) * 3;
          for (const s of hotspots) {
            const d2 = (u - s.x) ** 2 * 2.2 + (v - s.y) ** 2;
            const pull = Math.exp(-d2 / 0.012) * s.w;
            dy += pull * 22 * Math.sin(t * 1.3 + i * 0.9 + s.x * 10) - pull * 10 * Math.sign(v - s.y);
          }
          const y = base + dy;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Soft glow under each hotspot.
      ctx.globalAlpha = 1;
      for (const s of hotspots) {
        const g = ctx.createRadialGradient(s.x * w, s.y * h, 0, s.x * w, s.y * h, 70 * s.w);
        g.addColorStop(0, "rgba(255,129,147,0.16)");
        g.addColorStop(1, "rgba(255,129,147,0)");
        ctx.fillStyle = g;
        ctx.fillRect(s.x * w - 80, s.y * h - 80, 160, 160);
      }
      ctx.globalCompositeOperation = "source-over";
    };
    const loop = (ms: number) => { draw(ms / 1000); raf = requestAnimationFrame(loop); };
    const onResize = () => { size(); draw(1); };
    size(); draw(1);
    window.addEventListener("resize", onResize);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [hotspots, street]);

  const venueNode = (v: MapVenue): ReactNode => (
    <button
      type="button"
      onClick={() => setSelected({ type: "venue", v })}
      aria-label={`${v.name}${v.openNow === true ? ", open now" : v.openNow === false ? ", closed" : ""}`}
      className="block"
    >
      <span className="relative block">
        {v.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed or demo URLs; small thumbnails
          <img src={v.photo.src} alt="" className="size-14 rounded-2xl border-2 border-ink object-cover shadow-lg ring-2 ring-coral/60" />
        ) : (
          <span className="vybe-ring grid size-11 place-items-center rounded-full font-display text-sm font-extrabold">
            {v.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- business logo
              <img src={v.logoUrl} alt="" className="size-full rounded-full object-cover" />
            ) : (
              v.name.slice(0, 1)
            )}
          </span>
        )}
        {v.openNow !== null && (
          <span className={`absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-ink ${v.openNow ? "bg-mint" : "bg-faint"}`} />
        )}
      </span>
    </button>
  );

  const truckNode = (t: MapTruck): ReactNode => (
    <button
      type="button"
      onClick={() => setSelected({ type: "truck", t })}
      aria-label={`${t.name}, food truck here now${t.until ? ` until ${t.until}` : ""}`}
      className="block"
    >
      <span className="relative flex flex-col items-center">
        <span className="grid size-11 place-items-center rounded-xl border-2 border-sky bg-surface-2 font-display text-sm font-extrabold shadow-lg">
          {t.name.slice(0, 1)}
        </span>
        <span className="-mt-1.5 rounded-md bg-sky px-1 text-[9px] font-extrabold leading-4 tracking-wider text-ink">TRUCK</span>
        {t.live && <span className="absolute -right-1 -top-1 size-3.5 animate-pulse rounded-full border-2 border-ink bg-coral" />}
      </span>
    </button>
  );

  const linkupNode = (l: MapLinkup): ReactNode => (
    <button
      type="button"
      onClick={() => setSelected({ type: "linkup", l })}
      className="vybe-gradient block whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold text-ink shadow-lg"
    >
      {OCCASIONS[l.occasion as Occasion] ?? "Link Up"} · {l.spotsLeft} {l.spotsLeft === 1 ? "spot" : "spots"}
    </button>
  );

  const friendNode = (f: MapFriend): ReactNode => (
    <button
      type="button"
      onClick={() => setSelected({ type: "friend", f })}
      className="grid size-9 place-items-center rounded-full border-2 border-sky bg-surface-2 font-display text-xs font-extrabold shadow-lg"
      aria-label={`${f.name} wants to ${INTENT_LABEL[f.intent].toLowerCase()}`}
    >
      {f.name.slice(0, 1).toUpperCase()}
    </button>
  );

  // Frequency-map layout: percentage positions inside the box.
  type FlatPin = { key: string; kind: "venue" | "truck" | "linkup" | "friend"; left: string; top: string; z: number; node: ReactNode };
  const flatPins: FlatPin[] = [
    ...venues.map((v) => ({ key: `v-${v.id}`, kind: "venue" as const, left: `${v.x}%`, top: `${v.y}%`, z: 1, node: venueNode(v) })),
    ...trucks.map((t) => ({ key: `t-${t.id}`, kind: "truck" as const, left: `${t.x}%`, top: `${t.y}%`, z: 10, node: truckNode(t) })),
    ...linkups.map((l) => ({ key: `l-${l.id}`, kind: "linkup" as const, left: `${l.x}%`, top: `${l.y}%`, z: 10, node: linkupNode(l) })),
    ...friends.map((f, i) => ({ key: `f-${f.userId}`, kind: "friend" as const, left: `calc(${f.x}% - ${28 + i * 8}px)`, top: `calc(${f.y}% - 30px)`, z: 10, node: friendNode(f) })),
  ];

  // Street-map layout: real coordinates; Mapbox keeps each pin in place as the map moves.
  const streetPins: StreetPin[] = [
    ...venues.map((v) => ({ key: `v-${v.id}`, lat: v.lat, lng: v.lng, z: 1, node: venueNode(v) })),
    ...trucks.map((t) => ({ key: `t-${t.id}`, lat: t.lat, lng: t.lng, z: 2, node: truckNode(t) })),
    ...linkups.map((l) => ({ key: `l-${l.id}`, lat: l.lat, lng: l.lng, z: 3, offset: [0, 34] as [number, number], node: linkupNode(l) })),
    ...friends
      .filter((f) => f.lat !== null && f.lng !== null)
      .map((f, i) => ({ key: `f-${f.userId}`, lat: f.lat!, lng: f.lng!, z: 3, offset: [-28 - i * 8, -30] as [number, number], node: friendNode(f) })),
  ];

  const empty = !data.venues.length && !data.linkups.length && !(data.trucks ?? []).length;

  return (
    <section aria-labelledby="map-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="map-h" className="text-xl font-bold">
          Your vybe in <span className="vybe-text">{data.city.name}</span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">City</span>
          <select
            value={data.city.slug}
            disabled={pending}
            onChange={(e) => start(() => setCity(e.target.value))}
            className="min-h-11 rounded-full border border-line bg-surface px-4 font-semibold"
          >
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div role="group" aria-label="Show on the map" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => { setFilter(f.key); setSelected(null); }}
            className={`min-h-9 rounded-full px-4 text-sm font-semibold ${filter === f.key ? "vybe-gradient text-ink" : "border border-line text-muted hover:text-text"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-[radial-gradient(120%_90%_at_50%_40%,#151222_0%,var(--color-ink)_75%)] sm:aspect-[16/10]">
        {street && mapboxToken ? (
          <StreetMap token={mapboxToken} bounds={data.city.bounds} pins={streetPins} onFail={() => setStreet(false)} />
        ) : (
          <>
            <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
            {flatPins.map((p) => (
              <div
                key={p.key}
                className={`absolute ${p.kind === "linkup" ? "-translate-x-1/2 translate-y-5" : p.kind === "friend" ? "" : "-translate-x-1/2 -translate-y-1/2"}`}
                style={{ left: p.left, top: p.top, zIndex: p.z }}
              >
                {p.node}
              </div>
            ))}
          </>
        )}

        {empty && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl bg-ink/80 p-5 text-center backdrop-blur">
            <p className="font-display text-lg font-bold">VYBR8 is just getting started in {data.city.name}</p>
            <p className="mt-1 text-sm text-muted">Post the first plate or start a Link Up to light up the map.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Link href="/post/new" className="vybe-gradient rounded-full px-4 py-2 text-sm font-bold text-ink">Post a plate</Link>
              <Link href="/vybe/new" className="rounded-full border border-line px-4 py-2 text-sm font-bold">Start a Link Up</Link>
            </div>
          </div>
        )}

        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-30 rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur">
            <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted hover:text-text">✕</button>
            {selected.type === "venue" && (
              <div className="flex gap-3 pr-8">
                {selected.v.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- thumbnail
                  <img src={selected.v.photo.src} alt={selected.v.photo.alt} className="size-16 shrink-0 rounded-xl object-cover" />
                )}
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1.5"><span className="truncate font-display font-bold">{selected.v.name}</span>{selected.v.approved && <ApprovedBadge small label="Approved" />}</p>
                  <p className="text-xs text-muted">
                    {selected.v.openNow === true ? <span className="text-mint">Open now</span> : selected.v.openNow === false ? "Closed now" : "Hours not listed"}
                    {selected.v.priceLevel ? ` · ${"$".repeat(selected.v.priceLevel)}` : ""}
                    {selected.v.photo?.rating != null ? ` · latest post ${selected.v.photo.rating.toFixed(1)}` : ""}
                  </p>
                  <div className="mt-2 flex gap-3 text-sm font-semibold">
                    <Link href={`/venue/${selected.v.businessSlug}`} className="text-sky">View place</Link>
                    <Link href={`/vybe/new?venue=${selected.v.businessSlug}`} className="text-coral">Link Up here</Link>
                  </div>
                </div>
              </div>
            )}
            {selected.type === "linkup" && (
              <div className="pr-8">
                <p className="font-display font-bold">{selected.l.title}</p>
                <p className="text-xs text-muted">
                  {selected.l.when}{selected.l.venueName ? ` · ${selected.l.venueName}` : ""} · {selected.l.spotsLeft} of {selected.l.capacity} spots left
                  {selected.l.isAlcoholic ? " · 21+" : ""}{selected.l.openToNewFriends ? " · open to new friends" : ""}
                </p>
                <Link href={`/vybe/${selected.l.id}`} className="mt-2 inline-block text-sm font-semibold text-sky">See the Link Up</Link>
              </div>
            )}
            {selected.type === "truck" && (
              <div className="pr-8">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-sky">Food truck{selected.t.live ? " · live" : ""}</p>
                <p className="font-display font-bold">{selected.t.name}</p>
                <p className="text-xs text-muted">
                  {selected.t.cuisine ? `${selected.t.cuisine} · ` : ""}{selected.t.where}
                </p>
                <p className="text-xs font-semibold text-coral">{selected.t.until ? `Here until ${selected.t.until}` : "Here now"}</p>
                <Link href={`/food-trucks/${selected.t.slug}`} className="mt-2 inline-block text-sm font-semibold text-sky">See the truck and menu</Link>
              </div>
            )}
            {selected.type === "friend" && (
              <div className="pr-8">
                <p className="font-display font-bold">{selected.f.name} wants to {INTENT_LABEL[selected.f.intent].toLowerCase()}</p>
                <p className="text-xs text-muted">{selected.f.note ?? ""}{selected.f.venueName ? ` · ${selected.f.venueName}` : ""}</p>
                <div className="mt-2 flex gap-3 text-sm font-semibold">
                  <Link href={`/profile/${selected.f.username}`} className="text-sky">Profile</Link>
                  <Link href={`/vybe/new?with=${selected.f.username}`} className="text-coral">Start a Link Up</Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-mint" /> Open now</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-faint" /> Closed</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full border-2 border-sky" /> Friends</span>
        <span className="inline-flex items-center gap-1.5"><i className="vybe-gradient h-2.5 w-5 rounded-full" /> Link Ups</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] border-2 border-sky" /> Food trucks here now</span>
        {!street && <span className="text-faint">Pins use each place&rsquo;s real location.</span>}
      </div>
    </section>
  );
}
