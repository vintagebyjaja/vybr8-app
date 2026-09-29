import Link from "next/link";
import {
  addMenuItem, addStop, deleteStop, endLive, markSoldOut, saveTruckProfile, updateStopStatus,
} from "@/app/(app)/food-trucks/actions";
import { GoLiveButton } from "@/components/trucks/GoLiveButton";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { cityDay } from "@/domain/linkups/linkups";
import { CITIES, findCity } from "@/domain/map/map";
import { formatCents } from "@/domain/menus/menus";
import { formatDayTime, formatTime, formatWindow, STOP_STATUS_LABEL, type StopStatus } from "@/domain/trucks/trucks";
import { requireViewer } from "@/server/auth";
import { getMenu, getPlaceStats } from "@/server/menus";
import { getMyTrucks, getTruck, type TruckDetail } from "@/server/trucks";

export const metadata = { title: "Truck dashboard" };

type Props = { searchParams: Promise<{ e?: string }> };

const ERRORS: Record<string, string> = {
  stop_fields: "Add a place name (2+ characters), a city, a date and start and end times.",
  stop_time: "Those times didn't work. Pick a date, a start and an end.",
  stop_long: "A stop can run up to 18 hours.",
  stop_past: "That stop has already ended. Pick a time later today or after.",
  stop_coords: "Add both latitude and longitude, or leave both blank.",
  live_fields: "Pick how long you're staying (1–8 hours).",
  live_where: "We need a spot for the pin. Use GPS, type the coordinates, or pick a posted stop with a location.",
  item_fields: "Give the item a name. Prices are numbers like 12 or 12.50.",
  profile_fields: "Links need to start with https://.",
  not_allowed: "That didn't go through. Only the truck's owners and managers can change it.",
  bad_request: "Something was off with that request. Try again.",
};

const STATUS_BUTTONS: { status: StopStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "delayed", label: "Delayed" },
  { status: "sold_out", label: "Sold out" },
  { status: "closed", label: "Closed" },
  { status: "cancelled", label: "Cancel" },
];

const input = "min-h-11 rounded-xl border border-line bg-ink px-3";
const field = "flex flex-col gap-1 text-sm";
const card = "flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4";

function Hidden({ t }: { t: TruckDetail }) {
  return (
    <>
      <input type="hidden" name="truck" value={t.id} />
      <input type="hidden" name="slug" value={t.slug} />
    </>
  );
}

async function TruckPanel({ slug, viewerId }: { slug: string; viewerId: string }) {
  const t = await getTruck(slug, viewerId);
  if (!t) return null;
  const [menu, stats] = await Promise.all([getMenu(t.id, viewerId), getPlaceStats(t.id)]);
  const city = findCity(t.homeCitySlug);
  const now = new Date();
  const today = cityDay(now, city.timezone);
  const upcoming = t.stops.filter((s) => s.state !== "ended");
  const withCoords = upcoming.filter((s) => s.lat != null && s.lng != null && s.state !== "cancelled");
  const p = `t-${t.id.slice(0, 8)}`;

  return (
    <section id={`truck-${t.slug}`} aria-labelledby={`${p}-h`} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${p}-h`} className="text-2xl font-extrabold">{t.name} {t.isDemo && <DemoBadge label="Demo" />}</h2>
          <p className="text-sm text-muted">{t.cuisine ?? "Add your cuisine below"}</p>
        </div>
        <Link href={`/food-trucks/${t.slug}`} className="text-sm font-semibold text-sky">View public page</Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-line bg-surface p-3 text-center">
          <p className="font-display text-2xl font-extrabold">{t.followers}</p>
          <p className="text-xs text-muted">Followers</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3 text-center">
          <p className="font-display text-2xl font-extrabold">{stats.overall != null ? <span className="vybe-text">{stats.overall.toFixed(1)}</span> : "–"}</p>
          <p className="text-xs text-muted">Truck score</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3 text-center">
          <p className="font-display text-2xl font-extrabold">{stats.count}</p>
          <p className="text-xs text-muted">Ratings</p>
        </div>
      </div>

      {/* WE'RE HERE */}
      <div className={`${card} ${t.live ? "border-coral/60" : ""}`}>
        <h3 className="text-lg font-extrabold">WE&rsquo;RE HERE</h3>
        {t.live ? (
          <>
            <p className="text-sm">
              <span className="font-bold text-coral">You&rsquo;re live</span> until {formatTime(t.live.expiresAt, city.timezone)}.
              {t.live.note ? ` "${t.live.note}"` : ""} It turns off automatically.
            </p>
            <form action={endLive}>
              <Hidden t={t} />
              <button className="min-h-11 rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">We&rsquo;ve left. Turn it off</button>
            </form>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-sky">Move the pin or change the time</summary>
              <div className="pt-3">
                <GoLiveButton truckId={t.id} slug={t.slug} citySlug={city.slug} stops={withCoords.map((s) => ({ id: s.id, label: `${s.locationName} · ${formatDayTime(s.startAt, s.timezone)}` }))} />
              </div>
            </details>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Drop a live pin on the Vybe Map so followers can find you right now.</p>
            <GoLiveButton truckId={t.id} slug={t.slug} citySlug={city.slug} stops={withCoords.map((s) => ({ id: s.id, label: `${s.locationName} · ${formatDayTime(s.startAt, s.timezone)}` }))} />
          </>
        )}
      </div>

      {/* Post a location */}
      <form action={addStop} className={card}>
        <h3 className="text-lg font-bold">Post a location</h3>
        <Hidden t={t} />
        <label className={field}>
          <span className="font-semibold">Where</span>
          <input name="location_name" required minLength={2} maxLength={80} placeholder="Uptown lunch spot" className={input} />
        </label>
        <label className={field}>
          <span className="font-semibold">Address (optional)</span>
          <input name="address" maxLength={160} placeholder="Trade & Tryon" className={input} />
        </label>
        <label className={field}>
          <span className="font-semibold">Event (optional)</span>
          <input name="event_name" maxLength={80} placeholder="Friday Night Market" className={input} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={field}>
            <span className="font-semibold">City</span>
            <select name="city" defaultValue={city.slug} className={input}>
              {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          <label className={field}>
            <span className="font-semibold">Date</span>
            <input name="date" type="date" required defaultValue={today} min={today} className={input} />
          </label>
          <label className={field}>
            <span className="font-semibold">Start</span>
            <input name="start" type="time" required defaultValue="11:00" className={input} />
          </label>
          <label className={field}>
            <span className="font-semibold">End</span>
            <input name="end" type="time" required defaultValue="14:00" className={input} />
          </label>
          <label className={field}>
            <span className="font-semibold">Latitude (optional)</span>
            <input name="lat" inputMode="decimal" placeholder="35.2271" className={input} />
          </label>
          <label className={field}>
            <span className="font-semibold">Longitude (optional)</span>
            <input name="lng" inputMode="decimal" placeholder="-80.8431" className={input} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-faint">Add coordinates to get a Directions button and a pin on the Vybe Map. Times are in the city&rsquo;s local time.</p>
        <label className={field}>
          <span className="font-semibold">Status</span>
          <select name="status" defaultValue="scheduled" className={input}>
            <option value="scheduled">Scheduled</option>
            <option value="open">Open now</option>
          </select>
        </label>
        <button className="vybe-gradient min-h-11 w-fit rounded-full px-6 text-sm font-bold text-ink">Post location</button>
        <p className="text-xs text-faint">Followers with Notify me on get an alert.</p>
      </form>

      {/* Upcoming stops */}
      <div className={card}>
        <h3 className="text-lg font-bold">Your stops</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nothing posted yet. Add today&rsquo;s spot above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{s.locationName}{s.eventName ? <span className="text-lavender"> · {s.eventName}</span> : null}</p>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase text-muted">{STOP_STATUS_LABEL[s.status]}</span>
                </div>
                <p className="text-sm text-muted">{formatDayTime(s.startAt, s.timezone).split(" ")[0]} {formatWindow(s.startAt, s.endAt, s.timezone)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_BUTTONS.filter((b) => b.status !== s.status).map((b) => (
                    <form key={b.status} action={updateStopStatus}>
                      <input type="hidden" name="stop" value={s.id} />
                      <input type="hidden" name="slug" value={t.slug} />
                      <input type="hidden" name="status" value={b.status} />
                      <button className={`min-h-10 rounded-full border px-3 text-xs font-bold hover:bg-surface-2 ${b.status === "cancelled" ? "border-danger/50 text-danger" : "border-line"}`}>{b.label}</button>
                    </form>
                  ))}
                  <form action={deleteStop}>
                    <input type="hidden" name="stop" value={s.id} />
                    <input type="hidden" name="slug" value={t.slug} />
                    <button className="min-h-10 rounded-full px-3 text-xs font-bold text-muted hover:text-danger">Delete</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Menu */}
      <div className={card}>
        <h3 className="text-lg font-bold">Menu</h3>
        {menu.length === 0 ? (
          <p className="text-sm text-muted">No items yet. Add your first one below.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {menu.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className={`truncate font-semibold ${i.soldOut ? "text-muted" : ""}`}>{i.name}</p>
                  <p className="text-xs text-faint">{[i.section, formatCents(i.priceCents), i.avgScore != null ? `${i.avgScore.toFixed(1)} score` : null].filter(Boolean).join(" · ")}</p>
                </div>
                <form action={markSoldOut}>
                  <input type="hidden" name="item" value={i.id} />
                  <input type="hidden" name="slug" value={t.slug} />
                  <input type="hidden" name="city" value={city.slug} />
                  <input type="hidden" name="sold_out" value={i.soldOut ? "0" : "1"} />
                  <button aria-pressed={i.soldOut} className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-bold ${i.soldOut ? "bg-coral/15 text-coral" : "border border-line hover:bg-surface-2"}`}>
                    {i.soldOut ? "Sold out today · Undo" : "Sold out today"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addMenuItem} className="flex flex-col gap-3 border-t border-line pt-4">
          <h4 className="font-bold">Add an item</h4>
          <Hidden t={t} />
          <label className={field}>
            <span className="font-semibold">Name</span>
            <input name="name" required maxLength={120} placeholder="Quesabirria tacos" className={input} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={field}>
              <span className="font-semibold">Price ($)</span>
              <input name="price" inputMode="decimal" placeholder="13" className={input} />
            </label>
            <label className={field}>
              <span className="font-semibold">Food or drink</span>
              <select name="category" defaultValue="food" className={input}>
                <option value="food">Food</option>
                <option value="drink">Drink (non-alcoholic)</option>
              </select>
            </label>
            <label className={field}>
              <span className="font-semibold">Section (optional)</span>
              <input name="section" maxLength={60} placeholder="Tacos" className={input} />
            </label>
            <label className={field}>
              <span className="font-semibold">Dish type (optional)</span>
              <input name="dish_type" maxLength={40} placeholder="birria-taco" className={input} />
            </label>
          </div>
          <label className={field}>
            <span className="font-semibold">Description (optional)</span>
            <textarea name="description" maxLength={600} rows={2} className="rounded-xl border border-line bg-ink px-3 py-2" />
          </label>
          <button className="min-h-11 w-fit rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Add item</button>
        </form>
      </div>

      {/* Profile */}
      <form action={saveTruckProfile} className={card}>
        <h3 className="text-lg font-bold">Truck profile</h3>
        <Hidden t={t} />
        <label className={field}>
          <span className="font-semibold">Cuisine</span>
          <input name="cuisine" maxLength={60} defaultValue={t.cuisine ?? ""} placeholder="Mexican · Birria" className={input} />
        </label>
        <label className={field}>
          <span className="font-semibold">Home city</span>
          <select name="home_city_slug" defaultValue={t.homeCitySlug ?? ""} className={input}>
            <option value="">Not set</option>
            {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className={field}>
          <span className="font-semibold">Ordering link (optional)</span>
          <input name="ordering_url" type="url" defaultValue={t.orderingUrl ?? ""} placeholder="https://" className={input} />
        </label>
        {[0, 1, 2].map((n) => (
          <label key={n} className={field}>
            <span className="font-semibold">Social link {n + 1} (optional)</span>
            <input name={`social_${n + 1}`} type="url" defaultValue={t.socials[n]?.url ?? ""} placeholder="https://instagram.com/yourtruck" className={input} />
          </label>
        ))}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input name="catering_available" type="checkbox" defaultChecked={t.cateringAvailable} className="size-5 accent-coral" />
          <span className="font-semibold">We take catering and private events</span>
        </label>
        <button className="vybe-gradient min-h-11 w-fit rounded-full px-6 text-sm font-bold text-ink">Save profile</button>
      </form>
    </section>
  );
}

export default async function TruckDashboardPage({ searchParams }: Props) {
  const viewer = await requireViewer("/food-truck/dashboard");
  const { e } = await searchParams;
  const trucks = await getMyTrucks(viewer.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/food-trucks" className="text-sm font-semibold text-muted hover:text-text">← Food trucks</Link>
        <h1 className="text-3xl font-extrabold">Truck <span className="vybe-text">dashboard</span></h1>
        <p className="text-muted">Post where you&rsquo;ll be, go live when you park, and keep the menu honest.</p>
      </header>

      {e && ERRORS[e] && <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">{ERRORS[e]}</p>}

      {trucks.length === 0 ? (
        <section className={card}>
          <h2 className="text-xl font-bold">Run a food truck?</h2>
          <p className="text-muted">
            Claim your truck to post stops, go live on the Vybe Map, mark items sold out and see your ratings. The VYBR8 team reviews every claim.
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
            <li>Find your truck on VYBR8, or ask us to add it.</li>
            <li>Send a claim with proof you run it.</li>
            <li>Once approved, your schedule tools show up here.</li>
          </ol>
          <p className="text-sm">The Business Free plan includes schedule management.</p>
          <Link href="/business/claim" className="vybe-gradient inline-flex min-h-11 w-fit items-center rounded-full px-6 text-sm font-bold text-ink">Claim your truck</Link>
        </section>
      ) : (
        trucks.map((t) => <TruckPanel key={t.id} slug={t.slug} viewerId={viewer.id} />)
      )}

      <p className="text-xs text-faint">Promoted placements are separate from your plan and are always labeled Promoted.</p>
    </div>
  );
}
