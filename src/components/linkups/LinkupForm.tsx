"use client";

import { useActionState, useState } from "react";
import { createLinkup, type FormState } from "@/app/(app)/vybe/actions";
import { DRINKS_BY_DEFAULT, MAX_SPOTS, MIN_SPOTS, OCCASIONS, type Occasion } from "@/domain/linkups/linkups";

const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-text placeholder:text-faint focus:border-sky";

export function LinkupForm({
  cities, defaultCity, venues, defaultVenue, canDrink, isAdult = true, turns21On = null, today,
}: {
  cities: { slug: string; name: string }[];
  defaultCity: string;
  venues: { city: string; slug: string; name: string }[];
  defaultVenue: string;
  canDrink: boolean;
  /** Under-18 hosts can only make friends-only or invite-only Link Ups. */
  isAdult?: boolean;
  /** Set when the host turns 21 soon: they can plan a drinks Link Up for that day or later. */
  turns21On?: string | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createLinkup, {});
  const [city, setCity] = useState(defaultCity);
  const [occasion, setOccasion] = useState<Occasion>("girls_night");
  const [spots, setSpots] = useState(6);
  const [venue, setVenue] = useState(defaultVenue);
  const [drinks, setDrinks] = useState(false);
  const [date, setDate] = useState(today);
  const drinksOk = canDrink || (!!turns21On && date >= turns21On);
  const bdayLabel = turns21On ? new Date(`${turns21On}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "";
  const cityVenues = venues.filter((v) => v.city === city);
  const occasions = Object.keys(OCCASIONS) as Occasion[];

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.errors && state.errors.length > 0 && (
        <ul role="alert" className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
          {state.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">What kind of Link Up?</legend>
        <div className="flex flex-wrap gap-2">
          {occasions.map((o) => (
            <label key={o} className="cursor-pointer">
              <input type="radio" name="occasion" value={o} checked={occasion === o} onChange={() => { setOccasion(o); if (drinksOk && DRINKS_BY_DEFAULT.includes(o)) setDrinks(true); }} className="peer sr-only" />
              <span className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-semibold text-muted peer-checked:border-transparent peer-checked:bg-surface-2 peer-checked:text-text peer-checked:ring-2 peer-checked:ring-coral peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky">
                {OCCASIONS[o]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-semibold">Name it</label>
        <input id="title" name="title" required minLength={3} maxLength={80} placeholder="Girls night out: wings + cocktails" className={input} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="city" className="text-sm font-semibold">City</label>
          <select id="city" name="city" value={city} onChange={(e) => { setCity(e.target.value); setVenue(""); }} className={input}>
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="venue" className="text-sm font-semibold">Place on VYBR8</label>
          <select id="venue" name="venue" value={venue} onChange={(e) => setVenue(e.target.value)} className={input}>
            <option value="">Somewhere else…</option>
            {cityVenues.map((v) => <option key={v.slug} value={v.slug}>{v.name}</option>)}
          </select>
        </div>
      </div>
      {!venue && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="meet_point" className="text-sm font-semibold">Where are you meeting?</label>
          <input id="meet_point" name="meet_point" maxLength={120} placeholder="My place, then an Uber downtown" className={input} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <label htmlFor="date" className="text-sm font-semibold">Date</label>
          <input id="date" name="date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="start" className="text-sm font-semibold">Starts</label>
          <input id="start" name="start" type="time" required defaultValue="19:00" className={input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="end" className="text-sm font-semibold">Ends</label>
          <input id="end" name="end" type="time" required defaultValue="23:00" className={input} />
        </div>
      </div>
      <p className="-mt-3 text-xs text-faint">Times are in the city&rsquo;s local time. If it ends after midnight, that&rsquo;s fine. The group chat closes when it ends.</p>

      <div className="flex flex-col gap-2">
        <label htmlFor="capacity" className="flex justify-between text-sm font-semibold">
          <span>How many spots?</span>
          <span className="vybe-text font-display text-lg">{spots} people</span>
        </label>
        <input id="capacity" name="capacity" type="range" min={MIN_SPOTS} max={MAX_SPOTS} value={spots} onChange={(e) => setSpots(Number(e.target.value))} className="accent-coral" />
        <p className="text-xs text-faint">Including you. Up to {MAX_SPOTS}. Guests you invite by link take a spot when they accept.</p>
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Who can see it?{!isAdult && <span className="ml-2 font-normal text-faint">Public Link Ups are for 18+.</span>}</legend>
        {[
          ...(isAdult ? [{ v: "public", t: "Public", d: "Anyone 18+ in the city" }] : []),
          { v: "friends", t: "Friends", d: "Your VYBR8 friends" },
          { v: "invite_only", t: "Invite only", d: "Only people you invite" },
        ].map((o, i) => (
          <label key={o.v} className="cursor-pointer">
            <input type="radio" name="visibility" value={o.v} defaultChecked={i === 0} className="peer sr-only" />
            <span className="flex h-full flex-col rounded-xl border border-line p-3 peer-checked:border-coral peer-checked:bg-surface-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky">
              <b className="text-sm">{o.t}</b><span className="text-xs text-muted">{o.d}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">How do people join?</legend>
        {[
          { v: "request", t: "I approve each person", d: "Good for public Link Ups" },
          { v: "open", t: "Anyone who sees it can join", d: "First come, first served" },
        ].map((o, i) => (
          <label key={o.v} className="cursor-pointer">
            <input type="radio" name="join_mode" value={o.v} defaultChecked={i === 0} className="peer sr-only" />
            <span className="flex h-full flex-col rounded-xl border border-line p-3 peer-checked:border-coral peer-checked:bg-surface-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky">
              <b className="text-sm">{o.t}</b><span className="text-xs text-muted">{o.d}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {isAdult && <label className="flex items-start gap-3 rounded-xl border border-line p-3">
        <input type="checkbox" name="open_to_new_friends" className="mt-1 size-4 accent-coral" defaultChecked={occasion === "meet_new_friends"} key={occasion} />
        <span><b className="text-sm">Open to meeting new friends</b><span className="block text-xs text-muted">Shows up under &ldquo;Meet new friends&rdquo; for people 18+ in {cities.find((c) => c.slug === city)?.name}.</span></span>
      </label>}

      {drinksOk ? (
        <label className="flex items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" name="is_alcoholic" checked={drinks && drinksOk} onChange={(e) => setDrinks(e.target.checked)} className="mt-1 size-4 accent-coral" />
          <span><b className="text-sm">Drinks involved (21+)</b><span className="block text-xs text-muted">Alcohol only. Only people who are 21 by the day of the Link Up can see or join, including guests. Leave it off for coffee, matcha, boba, lemonade or mocktails.</span></span>
        </label>
      ) : (
        <p className="text-xs text-faint">
          {turns21On
            ? `Planning your 21st? Pick ${bdayLabel} or later and you can mark it "Drinks involved (21+)". Only people who are 21 by that day can join.`
            : "Coffee, tea, matcha, boba, lemonade and mocktail Link Ups are open to everyone 13+. Alcohol Link Ups are for 21+."}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-semibold">Details <span className="font-normal text-faint">(optional)</span></label>
        <textarea id="description" name="description" maxLength={1000} rows={3} placeholder="Dress code, budget, who's driving…" className={`${input} py-2`} />
      </div>

      <button disabled={pending} className="vybe-gradient min-h-12 rounded-full text-base font-bold text-ink disabled:opacity-50">
        {pending ? "Creating…" : "Create Link Up"}
      </button>
    </form>
  );
}
