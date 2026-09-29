import Link from "next/link";
import { LinkupCardView } from "@/components/linkups/LinkupCardView";
import { CITIES, findCity } from "@/domain/map/map";
import { requireViewer } from "@/server/auth";
import { getCityLinkups, getMyLinkups } from "@/server/linkups";
import { getViewerCity } from "@/server/map";

export const metadata = { title: "Link Ups" };

type Props = { searchParams: Promise<{ city?: string }> };

export default async function VybePage({ searchParams }: Props) {
  const viewer = await requireViewer("/vybe");
  const { city: cityParam } = await searchParams;
  const city = findCity(await getViewerCity(viewer, cityParam));
  const mine = await getMyLinkups(viewer);
  const around = await getCityLinkups(city.slug, viewer, new Set(mine.map((m) => m.id)));
  const newFriends = around.filter((l) => l.openToNewFriends);
  const rest = around.filter((l) => !l.openToNewFriends);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold">Link <span className="vybe-text">Up</span></h1>
          <p className="mt-1 max-w-prose text-muted">Girls night, brunch crew, wing run. Pick your spots (up to 10), invite friends, or open it up to meet new people.</p>
        </div>
        <Link href="/vybe/new" className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Start a Link Up</Link>
      </header>

      <section aria-labelledby="mine-h" className="flex flex-col gap-3">
        <h2 id="mine-h" className="text-xl font-bold">Your Link Ups</h2>
        {mine.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-muted">Nothing planned yet. Start one or join one below.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">{mine.map((c) => <li key={c.id}><LinkupCardView card={c} /></li>)}</ul>
        )}
      </section>

      <section aria-labelledby="city-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="city-h" className="text-xl font-bold">Happening in {city.name}</h2>
          <nav aria-label="Cities" className="flex flex-wrap gap-1.5">
            {CITIES.map((c) => (
              <Link key={c.slug} href={`/vybe?city=${c.slug}`} aria-current={c.slug === city.slug ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${c.slug === city.slug ? "vybe-gradient text-ink" : "border border-line text-muted hover:text-text"}`}>
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
        {newFriends.length > 0 && (
          <>
            <h3 className="text-sm font-bold uppercase tracking-wide text-sky">Meet new friends</h3>
            <ul className="grid gap-3 sm:grid-cols-2">{newFriends.map((c) => <li key={c.id}><LinkupCardView card={c} /></li>)}</ul>
          </>
        )}
        {rest.length > 0 && (
          <>
            {newFriends.length > 0 && <h3 className="mt-2 text-sm font-bold uppercase tracking-wide text-muted">More Link Ups</h3>}
            <ul className="grid gap-3 sm:grid-cols-2">{rest.map((c) => <li key={c.id}><LinkupCardView card={c} /></li>)}</ul>
          </>
        )}
        {around.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-muted">No open Link Ups in {city.name} this week. Be the first.</p>
        )}
      </section>
    </div>
  );
}
