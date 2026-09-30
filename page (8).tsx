import Link from "next/link";
import { ShareButton } from "@/components/share/ShareButton";
import { notFound } from "next/navigation";
import { MenuList } from "@/components/menu/MenuList";
import { RankBadge } from "@/components/charts/RankBadge";
import { ranksForBusiness } from "@/server/charts";
import { RatePlace } from "@/components/ratings/RatePlace";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { findCity } from "@/domain/map/map";
import {
  directionsUrl, formatTime, formatWindow, groupStopsByDay, postedAgo, SOURCE_LABEL, STOP_STATUS_LABEL, type StopState,
} from "@/domain/trucks/trucks";
import { getViewer } from "@/server/auth";
import { getMenu, getPlaceStats } from "@/server/menus";
import { getTruck, type TruckStop } from "@/server/trucks";
import { followTruck, setNotify, unfollowTruck } from "../actions";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const truck = await getTruck((await params).slug, null);
  return { title: truck?.name ?? "Food truck", description: truck?.cuisine ? `${truck.name} · ${truck.cuisine}. Where it's parked and what to order.` : undefined };
}

const STATE_STYLE: Record<StopState, string> = {
  here_now: "bg-coral/15 text-coral",
  later_today: "border border-sky/50 text-sky",
  upcoming: "border border-line text-muted",
  ended: "bg-surface-2 text-faint",
  cancelled: "bg-danger/10 text-danger",
};

function stopBadge(s: TruckStop): string {
  if (s.status === "cancelled") return "CANCELLED";
  if (s.status === "delayed") return s.state === "ended" ? "ENDED" : "DELAYED";
  if (s.status === "sold_out") return s.state === "ended" ? "ENDED" : "SOLD OUT";
  if (s.state === "here_now") return "HERE NOW";
  if (s.state === "ended") return s.status === "closed" ? "CLOSED" : "ENDED";
  return STOP_STATUS_LABEL[s.status].toUpperCase();
}

function BigScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface p-3 text-center">
      <span className="font-display text-3xl font-extrabold leading-none">{value != null ? <span className="vybe-text">{value.toFixed(1)}</span> : <span className="text-faint">–</span>}</span>
      <span className="text-xs font-semibold text-muted">{label}</span>
    </div>
  );
}

export default async function TruckPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await getViewer();
  const truck = await getTruck(slug, viewer?.id ?? null);
  if (!truck) notFound();
  const [menu, stats, ranks] = await Promise.all([
    getMenu(truck.id, viewer?.id ?? null),
    getPlaceStats(truck.id),
    truck.homeCitySlug ? ranksForBusiness(truck.id, truck.homeCitySlug, findCity(truck.homeCitySlug).name, true) : Promise.resolve({ place: null, items: {} }),
  ]);
  const now = new Date();
  const returnTo = `/food-trucks/${truck.slug}`;
  const groups = groupStopsByDay(truck.stops.filter((s) => s.state !== "ended" || now.getTime() - new Date(s.endAt).getTime() < 12 * 3_600_000), truck.timezone, now);
  const hereStop = truck.stops.find((s) => s.state === "here_now");
  const nextStop = truck.stops.find((s) => s.state === "later_today" || s.state === "upcoming");
  const target = truck.live ? { lat: truck.live.lat, lng: truck.live.lng } : hereStop?.lat != null && hereStop.lng != null ? { lat: hereStop.lat, lng: hereStop.lng } : nextStop?.lat != null && nextStop.lng != null ? { lat: nextStop.lat, lng: nextStop.lng } : null;
  const homeCity = truck.homeCitySlug ? findCity(truck.homeCitySlug) : null;
  const hidden = (
    <>
      <input type="hidden" name="truck" value={truck.id} />
      <input type="hidden" name="slug" value={truck.slug} />
    </>
  );

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <Link href="/food-trucks" className="text-sm font-semibold text-muted hover:text-text">← Food trucks</Link>

      <header className="flex flex-col gap-4">
        <div className="relative h-40 overflow-hidden rounded-[var(--radius-card)] border border-line sm:h-52">
          {truck.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- truck photo from storage or demo path
            <img src={truck.photoUrl} alt={`${truck.name} truck`} className="size-full object-cover" />
          ) : (
            <div aria-hidden className="vybe-gradient grid size-full place-items-center">
              <span className="font-display text-6xl font-extrabold text-ink/80">{truck.name.slice(0, 1)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            <span>Food truck</span>
            {homeCity && <span>· {homeCity.name}, {homeCity.region}</span>}
            {truck.isDemo && <DemoBadge label="Demo truck" />}
          </div>
          <h1 className="text-4xl font-extrabold">{truck.name}</h1>
          {ranks.place && <div className="py-1"><RankBadge badge={ranks.place} /></div>}
          {truck.cuisine && <p className="text-lg text-muted">{truck.cuisine}</p>}
          {truck.description && <p className="max-w-prose text-muted">{truck.description}</p>}
          <p className="text-xs text-faint">{truck.followers} {truck.followers === 1 ? "follower" : "followers"}</p>
        </div>
      </header>

      {truck.live && (
        <section aria-label="Live now" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-coral/60 bg-coral/10 p-4">
          <p className="flex items-center gap-2 font-display text-xl font-extrabold text-coral">
            <i aria-hidden className="size-2.5 animate-pulse rounded-full bg-coral" />
            WE&rsquo;RE HERE until {formatTime(truck.live.expiresAt, truck.timezone)}
          </p>
          {truck.live.note && <p className="text-sm">{truck.live.note}</p>}
          <p className="text-xs text-muted">Posted by the truck · {postedAgo(truck.live.startedAt, now, truck.timezone)}</p>
          <a href={directionsUrl(truck.live.lat, truck.live.lng)} target="_blank" rel="noopener noreferrer" className="vybe-gradient inline-flex min-h-11 w-fit items-center rounded-full px-5 text-sm font-bold text-ink">Directions</a>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {viewer ? (
          truck.following ? (
            <>
              <form action={unfollowTruck}>
                {hidden}
                <button className="min-h-11 rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Following · Unfollow</button>
              </form>
              <form action={setNotify}>
                {hidden}
                <input type="hidden" name="notify" value={truck.notify ? "0" : "1"} />
                <button aria-pressed={truck.notify} className={`min-h-11 rounded-full px-5 text-sm font-bold ${truck.notify ? "border border-sky/60 text-sky" : "border border-line text-muted"}`}>
                  {truck.notify ? "Notify me: on" : "Notify me: off"}
                </button>
              </form>
            </>
          ) : (
            <form action={followTruck}>
              {hidden}
              <button className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-bold text-ink">Follow and save</button>
            </form>
          )
        ) : (
          <Link href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`} className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Sign in to follow</Link>
        )}
        {target && !truck.live && (
          <a href={directionsUrl(target.lat, target.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Directions</a>
        )}
        <ShareButton path={`/food-trucks/${truck.slug}`} title={truck.name} text={`${truck.name} food truck on VYBR8`} />
        {truck.orderingUrl && (
          <a href={truck.orderingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Order ahead</a>
        )}
        {truck.canEdit && (
          <Link href="/food-truck/dashboard" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-coral hover:bg-surface-2">Manage truck</Link>
        )}
      </div>
      {viewer && truck.following && <p className="-mt-6 text-xs text-faint">With Notify me on, you&rsquo;ll get an alert when {truck.name} posts a new stop.</p>}
      {(truck.socials.length > 0 || truck.website) && (
        <ul aria-label="Socials" className="-mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          {truck.socials.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">{s.label}</a></li>)}
          {truck.website && /^https:\/\//.test(truck.website) && <li><a href={truck.website} target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">Website</a></li>}
        </ul>
      )}

      <section aria-labelledby="where-h" className="flex flex-col gap-4">
        <h2 id="where-h" className="text-xl font-extrabold tracking-wide">WHERE&rsquo;S THE TRUCK?</h2>
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No stops posted for the next two weeks. Follow to hear when they post one.</p>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="flex flex-col gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">{g.label}</h3>
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {g.stops.map((s) => (
                  <li key={s.id} className={`flex flex-col gap-1.5 p-4 ${s.state === "ended" || s.state === "cancelled" ? "opacity-70" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-display font-bold tabular-nums">{formatWindow(s.startAt, s.endAt, s.timezone)}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide ${s.status === "delayed" || s.status === "sold_out" ? "bg-orange/15 text-orange" : STATE_STYLE[s.state]}`}>{stopBadge(s)}</span>
                    </div>
                    <p className={`font-semibold ${s.status === "cancelled" ? "line-through" : ""}`}>{s.locationName}</p>
                    {s.eventName && <p className="text-sm text-lavender">{s.eventName}</p>}
                    {s.address && <p className="text-sm text-faint">{s.address}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                      <span>{SOURCE_LABEL[s.source]}{s.verifiedAt ? " · verified" : ""} · updated {postedAgo(s.updatedAt, now, s.timezone)}</span>
                      {s.lat != null && s.lng != null && s.state !== "ended" && s.state !== "cancelled" && (
                        <a href={directionsUrl(s.lat, s.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center font-semibold text-sky">Directions</a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="text-xs text-faint">Locations come from the truck and always show when they were posted. Plans change, so check the truck&rsquo;s socials before you go.</p>
      </section>

      <section aria-labelledby="scores-h" className="flex flex-col gap-3">
        <h2 id="scores-h" className="text-xl font-bold">Ratings</h2>
        <div className="grid grid-cols-3 gap-2">
          <BigScore label="Truck" value={stats.overall} />
          <BigScore label="Service Vybe" value={stats.serviceVybe} />
          <BigScore label="Value" value={stats.value} />
        </div>
        <p className="text-xs text-faint">{stats.count > 0 ? `From ${stats.count} ${stats.count === 1 ? "rating" : "ratings"}.` : "No ratings yet. Be the first."}</p>
        {viewer ? (
          <RatePlace businessId={truck.id} returnTo={returnTo} label="Rate this truck" />
        ) : (
          <Link href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`} className="text-sm font-semibold text-sky">Sign in to rate</Link>
        )}
      </section>

      <section id="menu" aria-labelledby="menu-h" className="flex scroll-mt-20 flex-col gap-3">
        <h2 id="menu-h" className="text-xl font-bold">Menu</h2>
        <MenuList items={menu} signedIn={!!viewer} returnTo={returnTo} ranks={ranks.items} />
      </section>

      <section aria-labelledby="catering-h" className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
        <h2 id="catering-h" className="font-bold">Catering</h2>
        <p className="text-sm text-muted">
          {truck.cateringAvailable
            ? `${truck.name} books private events and catering. Reach out through their socials${truck.orderingUrl ? " or ordering page" : ""} to check dates.`
            : "This truck hasn't said it takes catering bookings yet."}
        </p>
      </section>
    </article>
  );
}
