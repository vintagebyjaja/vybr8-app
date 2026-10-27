"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ETA_STALE_MIN, formatMiles, formatMinutes, grooveGuideUrl, leaveBy, leaveByLabel, milesBetween, type Destination, type TravelMode,
} from "@/domain/trips/trips";

type Pt = { lat: number; lng: number };
type Route = { minutes: number; miles: number; estimate: boolean };
export type GroupEtaView = { userId: string; name: string; minutesAway: number; arrivesAt: string; mode: TravelMode; updatedAt: string; mine: boolean };

type Props = {
  destination: Destination;
  token: string | null;
  /** City center, to find a meet point typed as text ("Freedom Park"). */
  near?: Pt | null;
  /** Link Up start: shows "Leave by …". */
  startsAt?: string | null;
  timezone?: string;
  /** Shared ETAs for a Link Up the viewer is going to. */
  eta?: {
    initial: GroupEtaView[];
    canShare: boolean;
    load: () => Promise<GroupEtaView[]>;
    share: (minutes: number, mode: TravelMode) => Promise<string | null>;
    stop: () => Promise<void>;
  } | null;
};

const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold";

async function routeFor(from: Pt, to: Pt, mode: TravelMode, token: string | null): Promise<Route> {
  const straight = milesBetween(from, to);
  if (token) {
    try {
      const profile = mode === "walk" ? "walking" : "driving-traffic";
      const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${encodeURIComponent(token)}`);
      if (r.ok) {
        const j = (await r.json()) as { routes?: { duration: number; distance: number }[] };
        const best = j.routes?.[0];
        if (best) return { minutes: best.duration / 60, miles: best.distance / 1609.34, estimate: false };
      }
    } catch { /* fall back to an estimate below */ }
  }
  // Rough: roads wind ~1.3× the straight line; 25 mph in town, 3 mph on foot.
  const miles = straight * 1.3;
  return { minutes: (miles / (mode === "walk" ? 3 : 25)) * 60, miles, estimate: true };
}

async function geocode(text: string, near: Pt | null | undefined, token: string | null): Promise<Pt | null> {
  if (!token) return null;
  try {
    const prox = near ? `&proximity=${near.lng},${near.lat}` : "";
    const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}&limit=1&country=us${prox}&access_token=${encodeURIComponent(token)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
    const c = j.features?.[0]?.geometry.coordinates;
    return c ? { lng: c[0], lat: c[1] } : null;
  } catch {
    return null;
  }
}

function here(): Promise<Pt> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
  });
}

/**
 * Distance, travel time and (for Link Ups) a leave-by time, plus one tap into Groove Guide.
 * Your location stays in your browser: it's only sent to Mapbox to get the route, never saved by VYBR8.
 * For a Link Up, people going can choose to share just their ETA with the group.
 */
export function TripPlanner({ destination, token, near, startsAt, timezone = "America/New_York", eta }: Props) {
  const [mode, setMode] = useState<TravelMode>("drive");
  const [to, setTo] = useState<Pt | null>(destination.lat != null && destination.lng != null ? { lat: destination.lat, lng: destination.lng } : null);
  const [from, setFrom] = useState<Pt | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "error">("idle");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupEtaView[]>(eta?.initial ?? []);
  const [now, setNow] = useState(() => Date.now());
  const guide = grooveGuideUrl(destination);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Find a typed meet point once.
  useEffect(() => {
    if (to || !destination.address && !destination.name) return;
    let off = false;
    geocode(destination.address ?? destination.name, near, token).then((p) => { if (!off && p) setTo(p); });
    return () => { off = true; };
  }, [to, destination.address, destination.name, near, token]);

  const locate = useCallback(async () => {
    setStatus("locating");
    try {
      setFrom(await here());
      setStatus("idle");
    } catch (e) {
      setStatus((e as GeolocationPositionError)?.code === 1 ? "denied" : "error");
    }
  }, []);

  // Start automatically if they already allowed location for VYBR8.
  useEffect(() => {
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((s) => { if (s.state === "granted") void locate(); }).catch(() => {});
  }, [locate]);

  useEffect(() => {
    if (!from || !to) return;
    let off = false;
    routeFor(from, to, mode, token).then((r) => { if (!off) setRoute(r); });
    return () => { off = true; };
  }, [from, to, mode, token]);

  // While sharing: refresh my position, route and ETA every minute.
  useEffect(() => {
    if (!sharing || !eta || !to) return;
    let off = false;
    const tick = async () => {
      try {
        const p = await here();
        if (off) return;
        setFrom(p);
        const r = await routeFor(p, to, modeRef.current, token);
        if (off) return;
        setRoute(r);
        const err = await eta.share(r.minutes, modeRef.current);
        if (err) { setShareError(err); setSharing(false); }
        else setGroup(await eta.load());
      } catch {
        setShareError("Couldn't get your location. Sharing paused.");
        setSharing(false);
      }
    };
    void tick();
    const t = window.setInterval(tick, 60_000);
    return () => { off = true; window.clearInterval(t); };
  }, [sharing, eta, to, token]);

  // Keep the group's ETAs fresh while the page is open.
  useEffect(() => {
    if (!eta) return;
    const t = window.setInterval(async () => { setNow(Date.now()); if (!document.hidden) setGroup(await eta.load()); }, 60_000);
    return () => window.clearInterval(t);
  }, [eta]);

  const stopSharing = async () => {
    setSharing(false);
    await eta?.stop();
    if (eta) setGroup(await eta.load());
  };

  const leave = route && startsAt ? leaveBy(new Date(startsAt), route.minutes, mode, new Date(now)) : null;
  const fresh = group.filter((g) => now - new Date(g.updatedAt).getTime() < ETA_STALE_MIN * 60_000);

  return (
    <section aria-labelledby="trip-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="trip-h" className="text-lg font-bold">Getting there</h2>
        <div role="group" aria-label="Travel mode" className="flex rounded-full border border-line p-0.5 text-xs font-bold">
          {(["drive", "walk"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`min-h-8 rounded-full px-3 ${mode === m ? "bg-text text-ink" : "text-muted"}`}>{m === "drive" ? "🚗 Drive" : "🚶 Walk"}</button>
          ))}
        </div>
      </div>

      {route ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="font-display text-2xl font-extrabold tabular-nums">{route.estimate ? "about " : ""}{formatMinutes(route.minutes)}</p>
          <p className="text-sm text-muted tabular-nums">{formatMiles(route.miles)}{route.estimate ? " · rough estimate" : mode === "drive" ? " · with current traffic" : ""}</p>
          {leave && <p className={`w-full text-sm font-bold ${leave.late ? "text-coral" : "text-mint"}`}>{leaveByLabel(leave, timezone)}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-muted">
          {status === "denied" ? <p>Location is off for VYBR8. Turn it on in your browser settings to see your travel time, or open Groove Guide below.</p>
            : status === "error" ? <p>Couldn&rsquo;t get your location. Try again, or open Groove Guide below.</p>
            : !to ? <p>We couldn&rsquo;t pin this spot on the map. Groove Guide can still find it.</p>
            : <p>See how far it is{startsAt ? " and when to leave" : ""}. Your location stays on your phone; VYBR8 never saves it.</p>}
          {to && status !== "denied" && (
            <button type="button" onClick={locate} disabled={status === "locating"} className={`${btn} self-start border border-line text-text hover:bg-surface-2 disabled:opacity-60`}>
              {status === "locating" ? "Finding you…" : "📍 Use my location"}
            </button>
          )}
        </div>
      )}

      {guide && (
        <a href={guide} target="_blank" rel="noopener noreferrer" className={`${btn} vybe-gradient text-ink hover:brightness-110`}>
          Navigate with Groove Guide ↗
        </a>
      )}

      {eta && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="text-sm font-bold">Who&rsquo;s on the way</h3>
          {fresh.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {fresh.map((g) => (
                <li key={g.userId} className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{g.mine ? "You" : g.name} <span className="font-normal text-faint">{g.mode === "walk" ? "🚶" : "🚗"}</span></span>
                  <span className="tabular-nums text-muted">
                    {g.minutesAway <= 1 ? "arriving now" : `${formatMinutes(g.minutesAway)} away`} · {new Date(g.arrivesAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No one&rsquo;s sharing an ETA yet.</p>}
          {eta.canShare && (sharing ? (
            <button type="button" onClick={stopSharing} className={`${btn} self-start border border-coral/50 text-coral`}>Stop sharing my ETA</button>
          ) : (
            <button type="button" disabled={!to} onClick={() => { setShareError(null); setSharing(true); }}
              className={`${btn} self-start border border-mint/50 text-mint hover:bg-mint/10 disabled:opacity-50`}>Share my ETA with the group</button>
          ))}
          {sharing && <p className="text-xs text-faint">Sharing only how long until you arrive, never your location. It updates every minute while this page is open and stops when the Link Up ends.</p>}
          {shareError && <p role="alert" className="text-xs text-coral">{shareError}</p>}
        </div>
      )}
    </section>
  );
}
