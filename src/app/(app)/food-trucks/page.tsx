import Link from "next/link";
import { CITIES, findCity } from "@/domain/map/map";
import {
  directionsUrl, formatDayTime, formatTime, formatWindow, parseTruckFilter, postedAgo, SOURCE_LABEL, STOP_STATUS_LABEL, TRUCK_FILTERS, type TruckFilter,
} from "@/domain/trucks/trucks";
import { getViewer } from "@/server/auth";
import { getViewerCity } from "@/server/map";
import { listTrucks, type TruckCard } from "@/server/trucks";

export const metadata = { title: "Food Trucks" };

type Props = { searchParams: Promise<{ city?: string; when?: string }> };

const EMPTY: Record<TruckFilter, string> = {
  open_now: "No trucks have checked in right now. Try Today or This weekend.",
  today: "No stops posted for the rest of today.",
  weekend: "No weekend stops posted yet. Trucks usually post a few days ahead.",
  all: "No food trucks on VYBR8 here yet.",
};

function StatusPill({ t, now }: { t: TruckCard; now: Date }) {
  const s = t.stop;
  if (t.hereNow) {
    const until = t.live?.until ?? s?.endAt;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-3 py-1 text-xs font-extrabold text-coral">
        <i aria-hidden className="size-2 animate-pulse rounded-full bg-coral" />
        Here now{until ? ` until ${formatTime(until, t.timezone)}` : ""}
      </span>
    );
  }
  if (!s) return <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-faint">No stops posted</span>;
  if (s.state === "later_today") {
    const started = new Date(s.startAt) <= now;
    return (
      <span className="rounded-full border border-sky/50 px-3 py-1 text-xs font-bold text-sky">
        {started ? `Scheduled ${formatWindow(s.startAt, s.endAt, t.timezone)}` : `Later today ${formatTime(s.startAt, t.timezone)}`}
      </span>
    );
  }
  return <span className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted">Next: {formatDayTime(s.startAt, t.timezone)}</span>;
}

function Score({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <span className="flex flex-col">
      <span className="font-display text-lg font-extrabold leading-none"><span className="vybe-text">{value.toFixed(1)}</span></span>
      <span className="text-[11px] text-faint">{label}</span>
    </span>
  );
}

export default async function FoodTrucksPage({ searchParams }: Props) {
  const { city: cityParam, when } = await searchParams;
  const viewer = await getViewer();
  const city = findCity(await getViewerCity(viewer, cityParam));
  const filter = parseTruckFilter(when);
  const trucks = await listTrucks(city.slug, filter);
  const now = new Date();
  const href = (c: string, f: TruckFilter) => `/food-trucks?city=${c}&when=${f}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold">FOOD <span className="vybe-text">TRUCKS</span></h1>
        <p className="max-w-prose text-muted">Who&rsquo;s parked where in {city.name}, what to order, and how the regulars rate it.</p>
      </header>

      <nav aria-label="Cities" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {CITIES.map((c) => (
          <Link key={c.slug} href={href(c.slug, filter)} aria-current={c.slug === city.slug ? "page" : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-xs font-semibold ${c.slug === city.slug ? "vybe-gradient text-ink" : "border border-line text-muted hover:text-text"}`}>
            {c.name}
          </Link>
        ))}
      </nav>

      <nav aria-label="When" className="flex flex-wrap gap-2">
        {TRUCK_FILTERS.map((f) => (
          <Link key={f.key} href={href(city.slug, f.key)} aria-current={f.key === filter ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-extrabold tracking-wide ${f.key === filter ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`}>
            {f.label}
          </Link>
        ))}
      </nav>

      <p className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
        Locations come from the truck and always show when they were posted. Plans change, so check the truck&rsquo;s socials before you go.
      </p>

      {trucks.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-sm text-muted">
          <p>{EMPTY[filter]}</p>
          {filter !== "all" && <Link href={href(city.slug, "all")} className="mt-2 inline-block font-semibold text-sky">See all trucks in {city.name}</Link>}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {trucks.map((t) => (
            <li key={t.id}>
              <article className={`flex h-full flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-4 ${t.hereNow ? "border-coral/50" : "border-line"}`}>
                <div className="flex items-start gap-3">
                  {t.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- truck photo from storage or demo path
                    <img src={t.photoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span aria-hidden className="vybe-gradient grid size-14 shrink-0 place-items-center rounded-2xl font-display text-xl font-extrabold text-ink">{t.name.slice(0, 1)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold"><Link href={`/food-trucks/${t.slug}`} className="hover:underline">{t.name}</Link></h2>
                    {t.cuisine && <p className="truncate text-sm text-muted">{t.cuisine}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill t={t} now={now} />
                  {t.stop && (t.stop.status === "delayed" || t.stop.status === "sold_out") && (
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-extrabold uppercase text-orange">{STOP_STATUS_LABEL[t.stop.status]}</span>
                  )}
                </div>

                {t.stop && (
                  <div className="text-sm">
                    <p className="font-semibold">{t.stop.locationName}</p>
                    {t.stop.eventName && <p className="text-lavender">{t.stop.eventName}</p>}
                    {t.stop.address && <p className="text-faint">{t.stop.address}</p>}
                    <p className="mt-1 text-xs text-faint">{SOURCE_LABEL[t.stop.source]} · updated {postedAgo(t.stop.updatedAt, now, t.timezone)}</p>
                  </div>
                )}
                {t.live?.note && <p className="text-sm text-coral">&ldquo;{t.live.note}&rdquo;</p>}

                {(t.topItem || t.stats) && (
                  <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-t border-line pt-3">
                    {t.topItem && (
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold">{t.topItem.name}</span>
                        <span className="text-[11px] text-faint">Top item · <span className="font-bold text-text">{t.topItem.score.toFixed(1)}</span></span>
                      </span>
                    )}
                    <Score label="Truck" value={t.stats?.overall ?? null} />
                    <Score label="Service Vybe" value={t.stats?.serviceVybe ?? null} />
                    <Score label="Value" value={t.stats?.value ?? null} />
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {t.lat != null && t.lng != null && (
                    <a href={directionsUrl(t.lat, t.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-bold hover:bg-surface-2">
                      Directions
                    </a>
                  )}
                  <Link href={`/food-trucks/${t.slug}#menu`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-sky hover:bg-surface-2">View menu</Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <p className="text-sm text-muted">
          Run a truck? <Link href="/food-truck/dashboard" className="font-semibold text-sky">Post your stops</Link>
        </p>
      )}
    </div>
  );
}
