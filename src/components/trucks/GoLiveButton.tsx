"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { goLive } from "@/app/(app)/food-trucks/actions";

type StopOption = { id: string; label: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-extrabold text-ink disabled:opacity-60">
      {pending ? "Going live..." : "WE'RE HERE"}
    </button>
  );
}

/**
 * WE'RE HERE: fills the location from the phone's GPS, a posted stop, or typed coordinates.
 * The pin always turns off on its own after the hours picked (1–8).
 */
export function GoLiveButton({ truckId, slug, citySlug, stops }: { truckId: string; slug: string; citySlug: string; stops: StopOption[] }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [gps, setGps] = useState<"idle" | "finding" | "found" | "failed">("idle");
  const [manual, setManual] = useState(false);
  const [stop, setStop] = useState(stops[0]?.id ?? "");

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGps("failed");
      setManual(true);
      return;
    }
    setGps("finding");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setGps("found");
      },
      () => {
        setGps("failed");
        setManual(true);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const id = `live-${truckId}`;
  return (
    <form action={goLive} className="flex flex-col gap-3">
      <input type="hidden" name="truck" value={truckId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="city" value={citySlug} />
      {!manual && (
        <>
          <input type="hidden" name="lat" value={lat} />
          <input type="hidden" name="lng" value={lng} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={locate} disabled={gps === "finding"} className="min-h-11 rounded-full border border-sky/60 px-4 text-sm font-bold text-sky hover:bg-sky/10 disabled:opacity-60">
          {gps === "finding" ? "Finding you..." : gps === "found" ? "Location set. Update" : "Use my location (GPS)"}
        </button>
        <button type="button" onClick={() => setManual((m) => !m)} className="min-h-11 px-3 text-sm font-semibold text-muted hover:text-text">
          {manual ? "Hide manual entry" : "Enter it by hand"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-xs text-faint">
        {gps === "found" && `Got it: ${lat}, ${lng}`}
        {gps === "failed" && "Couldn't get your location. Type it in, or pick a posted stop."}
      </p>

      {manual && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Latitude</span>
            <input name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="35.2271" className="min-h-11 rounded-xl border border-line bg-ink px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Longitude</span>
            <input name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-80.8431" className="min-h-11 rounded-xl border border-line bg-ink px-3" />
          </label>
        </div>
      )}

      {stops.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">No GPS? Use a posted stop</span>
          <select name="stop" value={stop} onChange={(e) => setStop(e.target.value)} className="min-h-11 rounded-xl border border-line bg-ink px-3">
            <option value="">None</option>
            {stops.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="text-xs text-faint">Only used when there&rsquo;s no GPS or typed location.</span>
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-note`}>
          <span className="font-semibold">Note (optional)</span>
          <input id={`${id}-note`} name="note" maxLength={120} placeholder="Parked by the fountain" className="min-h-11 rounded-xl border border-line bg-ink px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-hours`}>
          <span className="font-semibold">For how long</span>
          <select id={`${id}-hours`} name="hours" defaultValue="4" className="min-h-11 rounded-xl border border-line bg-ink px-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} {h === 1 ? "hour" : "hours"}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <span className="text-xs text-muted">It turns off automatically.</span>
      </div>
    </form>
  );
}
