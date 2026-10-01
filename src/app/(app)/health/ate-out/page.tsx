import Link from "next/link";
import { FOOD_SLOTS, bodyHour, isYmd, slotForHour, type FoodSlot } from "@/domain/health/health";
import { findCity } from "@/domain/map/map";
import { PlaceLinks } from "@/components/places/PlaceLinks";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getRhythm, nowFor } from "@/server/health";
import { getViewerCity } from "@/server/map";
import { getMenu } from "@/server/menus";
import { getPlaceLinks } from "@/server/place-links";
import { logFood, logFromMenu } from "../actions";

export const metadata = { title: "Ate out?" };

type Search = { searchParams: Promise<{ date?: string; slot?: string; q?: string; place?: string; e?: string; added?: string }> };
type Place = { id: string; slug: string; name: string; branch_name: string | null; kind: string; website: string | null; locations: { address_line1: string | null; city: string | null; region: string | null; city_slug: string | null }[] };

const field = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm placeholder:text-faint focus:border-mint";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_LABEL: Record<string, string> = { restaurant_provided: "from the restaurant", verified: "verified", database_provided: "nutrition database", estimated: "estimate", unknown: "" };

/** "Ate out?" Pick the place, scroll its menu, tap what you had. Private to you, like the rest of the journal. */
export default async function AteOutPage({ searchParams }: Search) {
  const viewer = await requireViewer("/health/ate-out");
  const sp = await searchParams;
  const city = findCity(await getViewerCity(viewer));
  const rhythm = await getRhythm(viewer.id);
  const now = nowFor(rhythm, city.timezone);
  const date = isYmd(sp.date) && sp.date <= now.day ? sp.date : now.day;
  const slot: FoodSlot = FOOD_SLOTS.some((s) => s.key === sp.slot) ? (sp.slot as FoodSlot) : slotForHour(bodyHour(now.clock.minutes, rhythm.wake));
  const q = (sp.q ?? "").trim().slice(0, 60);
  const placeId = sp.place && UUID.test(sp.place) ? sp.place : null;
  const supabase = await createClient();
  const params = (p: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ date, slot, q: q || null, place: placeId, ...p })) if (v) u.set(k, v);
    return `/health/ate-out?${u}`;
  };
  const cols = "id, slug, name, branch_name, kind, website, locations:business_locations ( address_line1, city, region, city_slug )";
  const where = (p: Place) => {
    const l = p.locations[0];
    return [l?.address_line1, l?.city].filter(Boolean).join(", ");
  };

  // ── One place: its menu ──
  if (placeId) {
    const { data } = await supabase.from("businesses").select(cols).eq("id", placeId).is("deleted_at", null).maybeSingle();
    const place = data as unknown as Place | null;
    if (!place) return <NotFound back={params({ place: null })} />;
    const [menu, { data: cal }, links] = await Promise.all([
      getMenu(place.id, viewer.id),
      supabase.rpc("menu_calories", { p_business: place.id }),
      getPlaceLinks([place.id], viewer.id),
    ]);
    const calBy = new Map(((cal ?? []) as { menu_item_id: string; calories: number; source: string }[]).map((c) => [c.menu_item_id, c]));
    const sections = [...new Set(menu.map((m) => m.section ?? (m.category === "drink" ? "Drinks" : "Menu")))];
    const backHere = params({});

    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Header back={params({ place: null })} />
        <Notice e={sp.e} added={sp.added} />
        <SlotPicker slot={slot} href={(s) => params({ slot: s })} />

        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="font-display text-2xl font-extrabold">{place.name}{place.branch_name ? <span className="text-muted"> · {place.branch_name}</span> : null}</h2>
          {where(place) && <p className="text-sm text-muted">{where(place)}</p>}
          <PlaceLinks compact businessId={place.id} name={place.name} cityName={city.name} kind={place.kind} website={place.website} links={links.get(place.id) ?? []} />
        </section>

        {menu.length > 0 ? (
          <section aria-label="Menu" className="flex flex-col gap-4">
            <p className="text-sm text-muted">Tap what you had. <b className="text-text">½</b> if you split it.</p>
            {sections.map((sec) => (
              <div key={sec} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-faint">{sec}</h3>
                <ul className="mt-2 flex flex-col divide-y divide-line">
                  {menu.filter((m) => (m.section ?? (m.category === "drink" ? "Drinks" : "Menu")) === sec).map((m) => {
                    const c = calBy.get(m.id);
                    return (
                      <li key={m.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="text-xs text-muted tabular-nums">
                            {[m.priceCents != null ? `$${(m.priceCents / 100).toFixed(2)}` : null,
                              c ? `${c.source === "estimated" ? "~" : ""}${c.calories.toLocaleString()} cal${SOURCE_LABEL[c.source] ? ` · ${SOURCE_LABEL[c.source]}` : ""}` : "we'll estimate the calories"]
                              .filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {[0.5, 1].map((portion) => (
                          <form key={portion} action={logFromMenu}>
                            <input type="hidden" name="item" value={m.id} /><input type="hidden" name="date" value={date} />
                            <input type="hidden" name="slot" value={slot} /><input type="hidden" name="portion" value={portion} />
                            <input type="hidden" name="back" value={backHere} />
                            <button aria-label={portion === 1 ? `Add ${m.name}` : `Add half of ${m.name}`}
                              className={portion === 1
                                ? "min-h-10 rounded-full bg-mint px-4 text-sm font-bold text-ink hover:brightness-110"
                                : "min-h-10 rounded-full border border-line px-3 text-sm font-bold text-muted hover:text-text"}>
                              {portion === 1 ? "+ Add" : "½"}
                            </button>
                          </form>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            {place.name} hasn&rsquo;t put its menu on VYBR8 yet. Type what you had below and VYBR8 estimates it. Big chains publish their nutrition, so those estimates use the restaurant&rsquo;s own numbers.
          </p>
        )}

        <details className="rounded-2xl border border-line bg-surface p-4" open={menu.length === 0}>
          <summary className="cursor-pointer list-none text-center font-bold text-mint">{menu.length ? "Not on the menu? Type what you got" : "What did you get?"}</summary>
          <form action={logFood} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="date" value={date} /><input type="hidden" name="slot" value={slot} /><input type="hidden" name="place" value={place.id} />
            <div className="grid grid-cols-2 gap-1 rounded-full border border-line p-1">
              {(["food", "drink"] as const).map((k) => (
                <label key={k} className="cursor-pointer rounded-full py-2 text-center text-sm font-bold text-muted has-[:checked]:bg-mint has-[:checked]:text-ink">
                  <input type="radio" name="kind" value={k} defaultChecked={k === "food"} className="sr-only" />{k === "food" ? "Food" : "Drink"}
                </label>
              ))}
            </div>
            <input name="name" required maxLength={120} placeholder="Spicy chicken sandwich, large fries…" className={field} />
            <div className="grid grid-cols-2 gap-3">
              <input name="amount" maxLength={40} placeholder="How much? (optional)" className={field} />
              <input name="calories" inputMode="numeric" placeholder="Calories (blank = estimate)" className={`${field} tabular-nums`} />
            </div>
            <button className="vybe-gradient min-h-12 rounded-full font-bold text-ink hover:brightness-110">Add it</button>
          </form>
        </details>
      </div>
    );
  }

  // ── Pick a place ──
  const clean = q.replace(/[%_,()]/g, "");
  const [{ data: found }, { data: recentRows }] = await Promise.all([
    clean.length >= 2
      ? supabase.from("businesses").select(cols).is("deleted_at", null).or(`name.ilike.%${clean}%,branch_name.ilike.%${clean}%`).limit(40)
      : Promise.resolve({ data: [] }),
    supabase.from("food_logs").select("business_id, logged_at").eq("user_id", viewer.id).not("business_id", "is", null).order("logged_at", { ascending: false }).limit(40),
  ]);
  const recentIds = [...new Set(((recentRows ?? []) as { business_id: string }[]).map((r) => r.business_id))].slice(0, 8);
  const { data: recentPlaces } = recentIds.length ? await supabase.from("businesses").select(cols).in("id", recentIds).is("deleted_at", null) : { data: [] };
  const recent = recentIds.map((id) => ((recentPlaces ?? []) as unknown as Place[]).find((p) => p.id === id)).filter((p): p is Place => !!p);
  // Places in your city first, then nearby towns and everywhere else.
  const results = ((found ?? []) as unknown as Place[])
    .sort((a, b) => Number(b.locations.some((l) => l.city_slug === city.slug)) - Number(a.locations.some((l) => l.city_slug === city.slug)) || a.name.localeCompare(b.name))
    .slice(0, 20);

  const row = (p: Place) => (
    <li key={p.id}>
      <Link href={params({ place: p.id })} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{p.name}{p.branch_name ? <span className="font-normal text-muted"> · {p.branch_name}</span> : null}</span>
          {where(p) && <span className="block truncate text-sm text-muted">{where(p)}</span>}
        </span>
        <span aria-hidden className="text-muted">›</span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <Header back={`/health?date=${date}`} />
      <Notice e={sp.e} added={sp.added} />
      <SlotPicker slot={slot} href={(s) => params({ slot: s })} />

      <form action="/health/ate-out" className="flex gap-2">
        <input type="hidden" name="date" value={date} /><input type="hidden" name="slot" value={slot} />
        <input name="q" defaultValue={q} placeholder="Where did you eat? Chick-fil-A, Ember & Oak…" aria-label="Search places" className={field} autoFocus={!recent.length} />
        <button className="min-h-11 shrink-0 rounded-xl bg-mint px-4 text-sm font-bold text-ink">Search</button>
      </form>

      {q && (
        results.length ? <ul className="flex flex-col gap-2">{results.map(row)}</ul>
          : <p className="text-sm text-muted">No places named &ldquo;{q}&rdquo; on VYBR8 yet. You can still add it from <Link href={`/health?date=${date}`} className="font-semibold text-mint">Add food or a drink</Link>, or <Link href="/places/new" className="font-semibold text-mint">add the place</Link>.</p>
      )}

      {!q && recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Places you&rsquo;ve logged from</h2>
          <ul className="flex flex-col gap-2">{recent.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

function Header({ back }: { back: string }) {
  return (
    <header className="flex items-center gap-3">
      <Link href={back} aria-label="Back" className="grid size-11 place-items-center rounded-full border border-line text-muted hover:text-text">‹</Link>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-mint">Active Vybe</p>
        <h1 className="font-display text-2xl font-extrabold leading-tight">Ate out?</h1>
        <p className="text-sm text-muted">Pick the place, tap what you had. Private to you.</p>
      </div>
    </header>
  );
}

function SlotPicker({ slot, href }: { slot: FoodSlot; href: (s: FoodSlot) => string }) {
  return (
    <nav aria-label="When did you have it?" className="flex flex-wrap gap-2">
      {FOOD_SLOTS.map((s) => (
        <Link key={s.key} href={href(s.key)} aria-current={s.key === slot ? "true" : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s.key === slot ? "border-text bg-text text-ink" : "border-line text-muted hover:text-text"}`}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

function Notice({ e, added }: { e?: string; added?: string }) {
  if (e) return <p role="alert" className="rounded-xl border border-coral/50 p-3 text-sm text-coral">{e.slice(0, 300)}</p>;
  if (added) return (
    <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-mint/50 p-3 text-sm text-mint">
      <span>Added {added.slice(0, 60)}.</span>
      <Link href="/health" className="font-bold underline">See your day</Link>
    </p>
  );
  return null;
}

function NotFound({ back }: { back: string }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Header back={back} />
      <p className="text-sm text-muted">That place isn&rsquo;t on VYBR8 anymore.</p>
    </div>
  );
}
