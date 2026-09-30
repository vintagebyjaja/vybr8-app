import Link from "next/link";
import { CraveMap, type CravePin } from "@/components/cravezone/CraveMap";
import { CraveItemCard, CravePlaceCard } from "@/components/cravezone/CraveResultCard";
import { CraveSearch } from "@/components/cravezone/CraveSearch";
import { tone } from "@/components/cravezone/tones";
import { CityChips } from "@/components/charts/CityChips";
import { NearMeButton } from "@/components/places/NearMeButton";
import { publicEnv } from "@/config/public-env";
import {
  CRAVE_FILTERS, CRAVE_SORTS, cravingHeadline, formatCents, isCraveFilter, parseCraving, parseSlugs, type CraveFilter, type CraveSort,
} from "@/domain/cravezone/cravezone";
import { findCity } from "@/domain/map/map";
import { formatDistance } from "@/domain/places/eat";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getCravingCategories, searchCravings } from "@/server/cravezone";
import { getViewerCity } from "@/server/map";
import { Suspense } from "react";

export const metadata = { title: "CraveZone results" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []);

export default async function CraveResults({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const categories = await getCravingCategories();
  const known = new Set(categories.map((c) => c.slug));
  const city = findCity(await getViewerCity(viewer, one(sp.city)));
  const lat = Number(one(sp.lat)), lng = Number(one(sp.lng));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && one(sp.lat) != null;

  const text = (one(sp.q) ?? "").trim().slice(0, 120);
  const parsed = text ? parseCraving(text, categories) : null;
  const include = [...new Set([...parseSlugs(many(sp.c).join(","), known), ...(parsed?.include ?? [])])].slice(0, 4);
  const exclude = [...new Set([...parseSlugs(many(sp.x).join(","), known), ...(parsed?.exclude ?? [])])].filter((s) => !include.includes(s));
  const filters = new Set<CraveFilter>(many(sp.f).filter(isCraveFilter));
  if (!one(sp.f) && viewer) {
    // Big Back Mode from your settings turns on the Big Back lens by default.
    const supabase = await createClient();
    const { data } = await supabase.from("user_settings").select("big_back_mode").eq("user_id", viewer.id).maybeSingle();
    if (data?.big_back_mode) filters.add("bigback");
  }
  if (parsed?.big) filters.add("bigback");
  const sort = (CRAVE_SORTS.some((s) => s.key === one(sp.sort)) ? one(sp.sort) : "match") as CraveSort;
  const view = one(sp.view) === "map" ? "map" : "list";

  const hasQuery = include.length > 0 || !!parsed?.freeText;
  const { items, places } = hasQuery
    ? await searchCravings(viewer, {
        city: city.slug, include, exclude, q: parsed?.freeText ?? null, lat: near ? lat : null, lng: near ? lng : null,
        filters, sort, maxPriceCents: parsed?.maxPriceCents ?? null, wantLight: !!parsed?.light, wantBig: !!parsed?.big,
      })
    : { items: [], places: [] };

  // Every link keeps the other choices. Only non-sensitive filters ever go in the URL.
  const state = { c: include, x: exclude, f: [...filters], sort, view, city: city.slug, lat: near ? String(lat) : null, lng: near ? String(lng) : null, q: parsed?.freeText ?? null };
  const href = (change: Partial<typeof state>) => {
    const s = { ...state, ...change };
    const u = new URLSearchParams();
    s.c.forEach((v) => u.append("c", v));
    if (s.x.length) u.set("x", s.x.join(","));
    if (s.f.length) u.set("f", s.f.join(","));
    else if (filters.has("bigback")) u.set("f", "none");
    if (s.sort !== "match") u.set("sort", s.sort);
    if (s.view !== "list") u.set("view", s.view);
    u.set("city", s.city);
    if (s.lat && s.lng) { u.set("lat", s.lat); u.set("lng", s.lng); }
    if (s.q) u.set("q", s.q);
    return `/cravezone/results?${u}`;
  };
  const back = href({});
  const toggleCat = (slug: string) => href({ c: include.includes(slug) ? include.filter((s) => s !== slug) : [...include, slug].slice(-4) });
  const toggleFilter = (k: CraveFilter) => href({ f: filters.has(k) ? [...filters].filter((x) => x !== k) : [...filters, k] });
  const headline = cravingHeadline(include, categories) || (parsed?.freeText ? `“${parsed.freeText.toUpperCase()}”` : "");
  const bigBack = filters.has("bigback");
  const chip = (on: boolean) => `shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${on ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`;

  const pins: CravePin[] = [
    ...items.filter((i) => i.lat != null && i.lng != null).map((i) => ({
      key: `i-${i.itemId}`, lat: i.lat!, lng: i.lng!, emoji: categories.find((c) => c.slug === i.matched[0])?.emoji ?? "😋",
      title: i.name, subtitle: i.business.name, score: i.score != null ? i.score.toFixed(1) : null, price: formatCents(i.priceCents), distance: formatDistance(i.meters),
      href: `${i.business.href}#item-${i.itemId}`,
    })),
    ...places.filter((p) => p.lat != null && p.lng != null).map((p) => ({
      key: `p-${p.business.id}`, lat: p.lat!, lng: p.lng!, emoji: categories.find((c) => c.slug === p.matched[0])?.emoji ?? "📍",
      title: p.business.name, subtitle: p.matched.length ? `Known for ${p.matched.map((s) => categories.find((c) => c.slug === s)?.name.toLowerCase()).join(", ")}` : "Could hit the spot",
      score: p.rating != null ? p.rating.toFixed(1) : null, price: null, distance: formatDistance(p.meters), href: p.business.href,
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/cravezone" className="text-sm text-muted hover:text-text">← CraveZone</Link>
      <CraveSearch defaultValue={text} />

      <header className="flex flex-col gap-1">
        <p className="font-display text-xs font-extrabold tracking-[0.25em] text-coral">{bigBack ? "BIG BACK CRAVEZONE 😈" : "YOU'RE CRAVING"}</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{headline || "Pick a craving"}</h1>
        {bigBack && include.length > 0 && <p className="text-muted">You said {include.map((s) => categories.find((c) => c.slug === s)?.name.toLowerCase()).join(" + ")}. We heard you.</p>}
        {exclude.length > 0 && <p className="text-sm text-muted">Leaving out: {exclude.map((s) => categories.find((c) => c.slug === s)?.name).join(", ")}</p>}
      </header>

      <nav aria-label="Cravings" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {categories.map((c) => {
          const on = include.includes(c.slug);
          return <Link key={c.slug} href={toggleCat(c.slug)} aria-pressed={on} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold ${on ? `${tone(c.tone).chip} text-text ring-1 ring-text` : "border-line text-muted hover:text-text"}`}>{c.emoji} {c.name}</Link>;
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <CityChips current={city.slug} hrefFor={(slug) => href({ city: slug, lat: null, lng: null })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Suspense><NearMeButton active={near} /></Suspense>
        <nav aria-label="Filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {CRAVE_FILTERS.filter((f) => f.key !== "saved" || viewer).map((f) => <Link key={f.key} href={toggleFilter(f.key)} aria-pressed={filters.has(f.key)} className={chip(filters.has(f.key))}>{f.label}</Link>)}
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Sort" className="flex flex-wrap gap-2">
          {CRAVE_SORTS.map((s) => <Link key={s.key} href={href({ sort: s.key })} aria-current={sort === s.key ? "true" : undefined} className={chip(sort === s.key)}>{s.label}</Link>)}
        </nav>
        <nav aria-label="View" className="flex rounded-full border border-line p-1">
          {(["list", "map"] as const).map((v) => <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-bold ${view === v ? "vybe-gradient text-ink" : "text-muted"}`}>{v === "list" ? "LIST" : "MAP"}</Link>)}
        </nav>
      </div>

      {!hasQuery ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">Tap a craving above or type what you want.</p>
      ) : view === "map" ? (
        <CraveMap city={city} pins={pins} mapboxToken={publicEnv.NEXT_PUBLIC_MAPBOX_TOKEN ?? null} />
      ) : (
        <>
          {items.length > 0 && (
            <section aria-labelledby="items-h" className="flex flex-col gap-3">
              <h2 id="items-h" className="sr-only">Dishes and drinks</h2>
              <ol className="flex flex-col gap-3">
                {items.map((i, n) => <li key={i.itemId}><CraveItemCard item={i} rank={n + 1} categories={categories} back={back} signedIn={!!viewer} cityName={city.name} /></li>)}
              </ol>
            </section>
          )}
          {places.length > 0 && (
            <section aria-labelledby="places-h" className="flex flex-col gap-3">
              <h2 id="places-h" className="text-lg font-bold">{items.length ? "More places that can hit it" : "Places that can hit this craving"}</h2>
              {!items.length && <p className="-mt-2 text-sm text-muted">These spots are known for it. Their menus aren&rsquo;t on VYBR8 yet, so we can&rsquo;t show exact dishes and prices.</p>}
              <ul className="grid gap-3 sm:grid-cols-2">
                {places.map((p) => <li key={p.business.id}><CravePlaceCard place={p} categories={categories} signedIn={!!viewer} back={back} cityName={city.name} /></li>)}
              </ul>
            </section>
          )}
          {!items.length && !places.length && (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center">
              <p className="font-bold">Nothing hits that craving here yet.</p>
              <p className="mt-1 text-sm text-muted">Try another city, fewer filters, or <Link href="/places/new" className="text-sky underline">add a place</Link> that should be on here.</p>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-faint">% VYBE is how well a dish fits your craving and your tastes. The VYBR8 score is what people rated it. Some place info © OpenStreetMap contributors.</p>
    </div>
  );
}
