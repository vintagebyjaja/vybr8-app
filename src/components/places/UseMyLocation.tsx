"use client";

import { useState } from "react";

/** Fills hidden lat/lng inputs from the phone's location, for someone standing at the place. */
export function UseMyLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) return setMsg("Your browser can't share location.");
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
        setMsg("Pinned to where you are.");
      },
      () => setMsg("Couldn't get your location. That's okay, the VYBR8 Team will place the pin."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <button type="button" onClick={locate} className="inline-flex min-h-11 items-center self-start rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">
        {coords ? "Pinned ✓ (tap to redo)" : "I'm here now: use my location"}
      </button>
      <p className="text-xs text-faint">{msg ?? "Optional. Only use this if you're at the place right now."}</p>
    </div>
  );
}
