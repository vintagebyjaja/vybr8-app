/* eslint-disable @next/next/no-img-element -- signed storage URLs */
import Link from "next/link";
import { KIND_TONE, KindIcon } from "@/components/places/KindIcon";
import { formatCents, type CravingCategory } from "@/domain/cravezone/cravezone";
import { formatDistance } from "@/domain/places/eat";
import type { CraveItem, CravePlace } from "@/server/cravezone";
import { toggleSavedItem } from "@/app/(app)/cravezone/actions";
import { tone } from "./tones";
import { PlaceLinks } from "@/components/places/PlaceLinks";

const directions = (lat: number | null, lng: number | null, _name: string) =>
  lat != null && lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null;
const pill = "inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-bold hover:bg-surface-2";

function OpenTag({ open }: { open: boolean | null }) {
  if (open == null) return null;
  return <span className={`text-xs font-bold ${open ? "text-mint" : "text-faint"}`}>{open ? "Open now" : "Closed now"}</span>;
}

/** One dish or drink that hits the craving. Photo first, then the numbers that matter. */
export function CraveItemCard({ item, rank, categories, back, signedIn, cityName }: { item: CraveItem; rank: number; categories: CravingCategory[]; back: string; signedIn: boolean; cityName: string }) {
  const cats = item.matched.map((s) => categories.find((c) => c.slug === s)).filter(Boolean) as CravingCategory[];
  const lead = cats[0];
  const dir = directions(item.lat, item.lng, item.business.name);
  const dist = formatDistance(item.meters);
  const price = formatCents(item.priceCents);
  return (
    <article className="flex overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <Link href={`${item.business.href}#item-${item.itemId}`} className={`relative grid w-28 shrink-0 place-items-center bg-gradient-to-br sm:w-40 ${lead ? tone(lead.tone).tile : "from-coral/20 to-surface"}`}>
        {item.photo ? <img src={item.photo} alt="" className="absolute inset-0 size-full object-cover" /> : <span aria-hidden className="text-5xl">{lead?.emoji ?? "😋"}</span>}
        <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 font-display text-xs font-extrabold">#{rank}</span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <p className="font-display text-sm font-extrabold tracking-wide vybe-text">{item.vybe}% VYBE</p>
        <h3 className="truncate text-lg font-bold leading-tight"><Link href={`${item.business.href}#item-${item.itemId}`} className="hover:underline">{item.name}</Link></h3>
        <p className="truncate text-sm text-muted"><Link href={item.business.href} className="hover:text-text">{item.business.name}</Link>{item.business.kind === "food_truck" && " · Food truck"}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {price && <b className="tabular-nums">{price}</b>}
          {item.score != null ? <span><b className="tabular-nums">{item.score.toFixed(1)}</b> <span className="text-muted">VYBR8 score ({item.ratings})</span></span> : <span className="text-xs text-faint">Not rated yet</span>}
          {dist && <span className="text-muted">{dist}</span>}
          <OpenTag open={item.openNow} />
        </p>
        {cats.length > 0 && <p className="flex flex-wrap gap-1">{cats.map((c) => <span key={c.slug} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone(c.tone).chip}`}>{c.emoji} {c.name}</span>)}</p>}
        <div className="mt-1 flex flex-wrap gap-2">
          {signedIn ? (
            <form action={toggleSavedItem}>
              <input type="hidden" name="item" value={item.itemId} /><input type="hidden" name="saved" value={item.itemSaved ? "1" : "0"} /><input type="hidden" name="back" value={back} />
              <button className={`${pill} ${item.itemSaved ? "border-coral/60 text-coral" : ""}`}>{item.itemSaved ? "♥ Saved" : "♡ Save"}</button>
            </form>
          ) : <Link href={`/auth/sign-in?next=${encodeURIComponent(back)}`} className={pill}>♡ Save</Link>}
          {dir && <a href={dir} target="_blank" rel="noopener noreferrer" className={pill}>Directions</a>}
          <Link href={`${item.business.href}#item-${item.itemId}`} className={pill}>View item</Link>
          <PlaceLinks compact businessId={item.business.id} name={item.business.rawName} cityName={cityName} kind={item.business.kind} website={item.business.website} links={item.business.links} />
          {item.business.kind !== "food_truck" && <Link href={signedIn ? `/vybe/new?${new URLSearchParams({ venue: item.business.slug, who: "friends" })}` : `/auth/sign-in?next=${encodeURIComponent(back)}`} className={pill}>+ Link Up</Link>}
        </div>
      </div>
    </article>
  );
}

/** A place that can hit the craving (its menu isn't on VYBR8 yet, or it's known for it). */
export function CravePlaceCard({ place, categories, signedIn, back, cityName }: { place: CravePlace; categories: CravingCategory[]; signedIn: boolean; back: string; cityName: string }) {
  const cats = place.matched.map((s) => categories.find((c) => c.slug === s)).filter(Boolean) as CravingCategory[];
  const dir = directions(place.lat, place.lng, place.business.name);
  const dist = formatDistance(place.meters);
  return (
    <article className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${KIND_TONE[place.business.kind] ?? "bg-surface-2"}`}><KindIcon kind={place.business.kind} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold"><Link href={place.business.href} className="hover:underline">{place.business.name}</Link></h3>
        <p className="flex flex-wrap items-center gap-x-3 text-sm">
          {place.rating != null ? <span><b className="tabular-nums">{place.rating.toFixed(1)}</b> <span className="text-muted">({place.ratings})</span></span> : <span className="text-xs text-faint">No VYBR8 ratings yet</span>}
          {dist && <span className="text-muted">{dist}</span>}
          <OpenTag open={place.openNow} />
        </p>
        {cats.length > 0 && <p className="mt-1 text-xs text-muted">Known for {cats.map((c) => `${c.emoji} ${c.name.toLowerCase()}`).join(", ")}</p>}
        {!place.hasMenu && <p className="text-xs text-faint">Menu not on VYBR8 yet</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {dir && <a href={dir} target="_blank" rel="noopener noreferrer" className={pill}>Directions</a>}
          <Link href={place.business.href} className={pill}>View place</Link>
          <PlaceLinks compact businessId={place.business.id} name={place.business.rawName} cityName={cityName} kind={place.business.kind} website={place.business.website} links={place.business.links} />
          {place.business.kind !== "food_truck" && <Link href={signedIn ? `/vybe/new?${new URLSearchParams({ venue: place.business.slug, who: "friends" })}` : `/auth/sign-in?next=${encodeURIComponent(back)}`} className={pill}>+ Link Up</Link>}
        </div>
      </div>
    </article>
  );
}
