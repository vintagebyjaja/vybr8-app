import Link from "next/link";
import { SearchBox } from "@/components/search/SearchBox";
import { formatCents } from "@/domain/menus/menus";
import { findCity } from "@/domain/map/map";
import { SEARCH_TABS, parseSearch } from "@/domain/search/intent";
import { getViewer } from "@/server/auth";
import { getViewerCity } from "@/server/map";
import { searchAll } from "@/server/search";

export const metadata = { title: "Search" };

type Props = { searchParams: Promise<{ q?: string; tab?: string; city?: string }> };

const KIND: Record<string, string> = { restaurant: "Restaurant", bar: "Bar", cocktail_lounge: "Cocktail lounge", lounge: "Lounge", hookah_lounge: "Hookah lounge", cigar_lounge: "Cigar lounge", cafe: "Coffee shop", tea_shop: "Tea & matcha", juice_bar: "Juice & lemonade", bakery: "Bakery", food_truck: "Food truck", brewery: "Brewery", nightlife: "Nightlife" };

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", tab: tabParam, city: cityParam } = await searchParams;
  const viewer = await getViewer();
  const city = findCity(await getViewerCity(viewer, cityParam));
  const parsed = parseSearch(q.slice(0, 120), tabParam);
  const results = q || parsed.tab !== "all" ? await searchAll(parsed, city.slug) : { items: [], places: [], chefs: [], trucks: [] };
  const empty = !results.items.length && !results.places.length && !results.chefs.length && !results.trucks.length;
  const href = (t: string) => `/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(t !== "all" ? { tab: t } : {}) })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold">What are you <span className="vybe-text">craving?</span></h1>
      <SearchBox q={q} tab={tabParam} />
      <nav aria-label="Search in" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {SEARCH_TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} aria-current={parsed.tab === t.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold tracking-wide ${parsed.tab === t.key ? "vybe-gradient text-ink" : "border border-line text-muted hover:text-text"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-faint">
        In {city.name}{parsed.openNow ? " · open now" : ""}{parsed.service ? ` · ${parsed.service.replace("_", " ")}` : ""}{parsed.occasion ? ` · ${parsed.occasion}` : ""}{parsed.guests ? ` · ${parsed.guests} guests` : ""}{parsed.maxBudget ? ` · under $${parsed.maxBudget}` : ""}
      </p>

      {results.items.length > 0 && (
        <section aria-labelledby="items-h" className="flex flex-col gap-2">
          <h2 id="items-h" className="text-lg font-bold">Dishes &amp; drinks</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {results.items.slice(0, 20).map((i, n) => (
              <li key={i.id}>
                <Link href={`/venue/${i.businessSlug}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="font-semibold">{i.avgScore != null && n < 3 ? <span className="mr-2 text-coral">#{n + 1}</span> : null}{i.name}</span>
                    <span className="block text-xs text-muted">{i.businessName} · {KIND[i.businessKind] ?? i.businessKind}{i.priceCents != null ? ` · ${formatCents(i.priceCents)}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-right">{i.avgScore != null ? <b className="font-display text-lg vybe-text">{i.avgScore.toFixed(1)}</b> : <span className="text-xs text-faint">Not rated</span>}<span className="block text-[11px] text-faint">{i.count ? `${i.count} ratings` : ""}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.trucks.length > 0 && (
        <section aria-labelledby="trucks-h" className="flex flex-col gap-2">
          <h2 id="trucks-h" className="text-lg font-bold">Food trucks</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {results.trucks.map((t) => (
              <li key={t.id}>
                <Link href={`/food-trucks/${t.slug}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
                  <span className="flex items-center justify-between gap-2"><b>{t.name}</b>{t.hereNow && <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[11px] font-bold text-sky">Here now</span>}</span>
                  <span className="text-xs text-muted">{t.cuisine}{t.stop ? ` · ${t.stop.locationName}` : ""}</span>
                  {t.topItem && <span className="text-xs">{t.topItem.name} · <b>{t.topItem.score.toFixed(1)}</b></span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.chefs.length > 0 && (
        <section aria-labelledby="chefs-h" className="flex flex-col gap-2">
          <h2 id="chefs-h" className="text-lg font-bold">Chefs</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {results.chefs.map((c) => (
              <li key={c.id}>
                <Link href={`/chef/${c.slug}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
                  <b>{c.name}{c.verified && <span className="ml-2 text-xs text-sky">Verified</span>}</b>
                  <span className="text-xs text-muted">{c.headline}{c.specialties.length ? ` · ${c.specialties.slice(0, 3).join(", ")}` : ""}</span>
                  <span className="text-xs text-faint">{c.accepting ? "Accepting clients" : c.restaurantOnly ? "Restaurant only" : "Not accepting clients"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.places.length > 0 && (
        <section aria-labelledby="places-h" className="flex flex-col gap-2">
          <h2 id="places-h" className="text-lg font-bold">Places</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {results.places.map((p) => (
              <li key={p.id}>
                <Link href={p.kind === "food_truck" ? `/food-trucks/${p.slug}` : `/venue/${p.slug}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
                  <span className="min-w-0"><b>{p.name}</b><span className="block text-xs text-muted">{KIND[p.kind] ?? p.kind}</span></span>
                  {p.overall != null && <b className="font-display text-lg vybe-text">{p.overall.toFixed(1)}</b>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(q || parsed.tab !== "all") && empty && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">Nothing on VYBR8 for that yet in {city.name}. Try fewer words, or <Link href="/post/new" className="text-sky">post the first plate</Link>.</p>
      )}
    </div>
  );
}
