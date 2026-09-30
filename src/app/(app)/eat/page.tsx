import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovedBadge } from "@/components/places/ApprovedBadge";
import { KIND_TONE, KindIcon } from "@/components/places/KindIcon";
import { NearMeButton } from "@/components/places/NearMeButton";
import { CityChips } from "@/components/charts/CityChips";
import { TasteForm } from "@/components/groups/TasteForm";
import { findCity } from "@/domain/map/map";
import { EAT_SORTS, EAT_TYPES, KIND_LABEL, cuisineLabel, formatDistance, type EatSort, type EatType } from "@/domain/places/eat";
import { getViewer } from "@/server/auth";
import { EAT_PAGE, getCityCuisines, getPlacesNear } from "@/server/eat";
import { getMyTaste } from "@/server/groups";
import { getViewerCity } from "@/server/map";

export const metadata = { title: "What Should I Eat?" };

const PHOTOS = new Set(["charlotte", "atlanta", "nashville", "houston", "phoenix", "dc", "brooklyn", "miami"]);
const chip = (on: boolean) => `shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`;

type Search = { searchParams: Promise<{ city?: string; lat?: string; lng?: string; type?: string; cuisine?: string; q?: string; open?: string; sort?: string; page?: string; saved?: string; closed?: string }> };

export default async function WhatToEatPage({ searchParams }: Search) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const city = findCity(await getViewerCity(viewer, sp.city));
  const lat = sp.lat && Number.isFinite(Number(sp.lat)) ? Number(sp.lat) : null;
  const lng = sp.lng && Number.isFinite(Number(sp.lng)) ? Number(sp.lng) : null;
  const near = lat != null && lng != null;
  const type = (EAT_TYPES.some((t) => t.key === sp.type) ? sp.type : "all") as EatType;
  const taste = viewer ? await getMyTaste(viewer) : null;
  const hasTaste = !!taste && (taste.likes.length > 0 || taste.dislikes.length > 0 || taste.dietary.length > 0);
  const sort = (EAT_SORTS.some((s) => s.key === sp.sort) ? sp.sort : hasTaste ? "for_you" : "near") as EatSort;
  const q = sp.q?.trim().slice(0, 60) || null;
  const cuisine = sp.cuisine && /^[a-z0-9_ -]{2,30}$/.test(sp.cuisine) ? sp.cuisine : null;
  const openNow = sp.open === "1";
  const page = Math.max(1, Math.min(20, Number(sp.page) || 1));

  const [rows, cuisines] = await Promise.all([
    getPlacesNear({
      city: city.slug, lat, lng, type, cuisine, q, openNow, sort, page,
      likes: taste ? [...taste.likes, ...taste.dietary] : [], dislikes: [...(taste?.dislikes ?? []), ...(taste?.allergies ?? [])],
    }),
    getCityCuisines(city.slug),
  ]);
  const hasMore = rows.length > EAT_PAGE;
  const places = rows.slice(0, EAT_PAGE);

  // Links keep every other filter as-is.
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const cur: Record<string, string | null> = { city: city.slug, lat: sp.lat ?? null, lng: sp.lng ?? null, type: type === "all" ? null : type, cuisine, q, open: openNow ? "1" : null, sort: sp.sort ?? null, page: null };
    for (const [k, v] of Object.entries({ ...cur, ...change })) if (v) next.set(k, v);
    return `/eat?${next}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="relative isolate overflow-hidden rounded-[var(--radius-card)] border border-line">
        {PHOTOS.has(city.slug) && <Image src={`/cities/${city.slug}.webp`} alt="" fill priority sizes="(min-width: 768px) 768px, 100vw" className="-z-10 object-cover" />}
        <div className="bg-[linear-gradient(90deg,rgba(7,6,11,.92),rgba(7,6,11,.55))] p-5">
          <h1 className="font-display text-3xl font-extrabold">What Should I Eat?</h1>
          <p className="text-sm text-white/80">Every spot in {city.name}, rated on VYBR8 or not. The vybers decide who&rsquo;s best.</p>
          <div className="mt-3"><Suspense><NearMeButton active={near} /></Suspense></div>
        </div>
      </header>

      <CityChips current={city.slug} hrefFor={(c) => `/eat?city=${c}`} />

      <form action="/eat" className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-coral/60">
        <input type="hidden" name="city" value={city.slug} />
        {near && <><input type="hidden" name="lat" value={sp.lat} /><input type="hidden" name="lng" value={sp.lng} /></>}
        {type !== "all" && <input type="hidden" name="type" value={type} />}
        <label htmlFor="eat-q" className="sr-only">Search places</label>
        <input id="eat-q" name="q" defaultValue={q ?? ""} placeholder="Search a place by name" className="min-h-12 flex-1 bg-transparent text-base placeholder:text-muted focus:outline-none" />
        <button className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold">Search</button>
      </form>

      <nav aria-label="Kind of place" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {EAT_TYPES.map((t) => <Link key={t.key} href={href({ type: t.key === "all" ? null : t.key, cuisine: null })} className={chip(t.key === type)}>{t.label}</Link>)}
        <Link href={href({ open: openNow ? null : "1" })} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${openNow ? "bg-mint text-ink" : "border border-mint/50 text-mint"}`}>Open now</Link>
      </nav>

      {cuisines.length > 0 && (
        <nav aria-label="Cuisine" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {cuisine && <Link href={href({ cuisine: null })} className={chip(false)}>All cuisines ×</Link>}
          {cuisines.map((c) => <Link key={c} href={href({ cuisine: c === cuisine ? null : c })} className={chip(c === cuisine)}>{cuisineLabel(c)}</Link>)}
        </nav>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full border border-line p-1 text-sm font-bold">
          {EAT_SORTS.map((s) => (
            <Link key={s.key} href={href({ sort: s.key })} aria-current={s.key === sort ? "true" : undefined}
              className={`rounded-full px-3 py-1.5 ${s.key === sort ? "bg-text text-ink" : "text-muted hover:text-text"}`}>{s.label}</Link>
          ))}
        </div>
        <p className="text-xs text-faint">{near ? "Distance from you" : `Distance from downtown ${city.name.split(",")[0]}`}</p>
      </div>

      {/* Tastes: what makes "For you" work */}
      {viewer ? (
        <details className="rounded-2xl border border-lavender/40 bg-surface p-4" open={!hasTaste && sort === "for_you"}>
          <summary className="cursor-pointer list-none text-sm font-bold text-lavender">
            {hasTaste ? `Your tastes: ${[...taste!.likes].slice(0, 4).join(", ") || "saved"} · edit` : "Tell VYBR8 what you like and your matches show first →"}
          </summary>
          <div className="mt-3"><TasteForm taste={taste!} returnTo={`/eat?city=${city.slug}&sort=for_you`} /></div>
        </details>
      ) : (
        <Link href="/auth/sign-in?next=/eat" className="rounded-2xl border border-lavender/40 bg-surface p-4 text-sm font-bold text-lavender">Sign in and add your tastes to see your matches first →</Link>
      )}
      {sp.closed && <p role="status" className="text-sm text-mint">Marked permanently closed. It&rsquo;s gone from VYBR8.</p>}
      {sp.saved && <p role="status" className="text-sm text-mint">Tastes saved. Your matches are at the top.</p>}

      {places.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">
          No places match that yet.{" "}
          <Link href={`/eat?city=${city.slug}`} className="font-semibold text-sky">Clear filters</Link> or{" "}
          <Link href="/places/new" className="font-semibold text-sky">add a place</Link>.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {places.map((p) => {
            const dist = formatDistance(p.meters);
            return (
              <li key={p.businessId}>
                <Link href={`/venue/${p.slug}`} className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:bg-surface-2">
                  {p.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- business logo
                    <img src={p.logoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${KIND_TONE[p.kind] ?? "bg-orange text-ink"}`}><KindIcon kind={p.kind} className="size-6" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{p.name}</span>
                      {p.approved && <ApprovedBadge small />}
                      {p.match > 0 && <span className="rounded-full bg-lavender/20 px-2 py-0.5 text-[11px] font-bold text-lavender">Matches your tastes</span>}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {[p.branch, KIND_LABEL[p.kind] ?? p.kind, ...p.cuisines.slice(0, 2).map(cuisineLabel), p.priceLevel ? "$".repeat(p.priceLevel) : null].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {dist && <span className="text-text tabular-nums">{dist}</span>}
                      {p.openNow === true && <span className="font-bold text-mint">Open now</span>}
                      {p.openNow === false && <span className="text-faint">Closed now</span>}
                      {p.ratings > 0 && p.rating != null
                        ? <span className="font-bold text-orange tabular-nums">{p.rating.toFixed(1)} on VYBR8 · {p.ratings} {p.ratings === 1 ? "rating" : "ratings"}</span>
                        : <span className="text-faint">No VYBR8 ratings yet</span>}
                    </p>
                  </div>
                  <span aria-hidden className="text-xl text-faint">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="More places" className="flex justify-between">
          {page > 1 ? <Link href={`${href({})}&page=${page - 1}`} className="rounded-full border border-line px-5 py-2 text-sm font-bold">← Previous</Link> : <span />}
          {hasMore && <Link href={`${href({})}&page=${page + 1}`} className="vybe-gradient rounded-full px-5 py-2 text-sm font-bold text-ink">More places →</Link>}
        </nav>
      )}

      <p className="text-center text-xs text-faint">
        Don&rsquo;t see a spot? <Link href="/places/new" className="underline">Add it</Link>. Some place info © OpenStreetMap contributors.
      </p>
    </div>
  );
}
