"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { roundCoord } from "@/domain/places/eat";

/** Sort by where you are right now. Your location is rounded to about 100 m and only used for this list. */
export function NearMeButton({ active }: { active: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);

  function go(next: URLSearchParams) {
    next.delete("page");
    router.replace(`${path}?${next}`, { scroll: false });
  }
  function locate() {
    if (!navigator.geolocation) return setMsg("Your browser can't share location.");
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = new URLSearchParams(sp.toString());
        next.set("lat", String(roundCoord(p.coords.latitude)));
        next.set("lng", String(roundCoord(p.coords.longitude)));
        setMsg(null);
        go(next);
      },
      () => setMsg("Couldn't get your location. Showing distance from downtown."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={locate}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold ${active ? "bg-sky text-ink" : "border border-sky/60 text-sky hover:bg-sky/10"}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
        {active ? "Near me ✓" : "Near me"}
      </button>
      {active && (
        <button type="button" onClick={() => { const n = new URLSearchParams(sp.toString()); n.delete("lat"); n.delete("lng"); go(n); }} className="text-xs font-semibold text-muted hover:text-text">
          Use downtown instead
        </button>
      )}
      {msg && <span className="text-xs text-faint">{msg}</span>}
    </div>
  );
}
