import Image from "next/image";
import Link from "next/link";
import { VybeWave } from "@/components/brand/VybeWave";
import { VybeMap } from "@/components/map/VybeMap";
import { VybeStatus } from "@/components/map/VybeStatus";
import { CITIES } from "@/domain/map/map";
import { getMapData, getViewerCity } from "@/server/map";
import { FeedTabs } from "@/components/posts/FeedTabs";
import { PostButton } from "@/components/posts/PostButton";
import { PostCard } from "@/components/posts/PostCard";
import { getViewer } from "@/server/auth";
import { getFeed } from "@/server/posts";
import { birthdayStatus, formatMonthDay, parseYmd, todayIn } from "@/domain/birthday/birthday";
import { ActiveVybeCard } from "@/components/home/ActiveVybeCard";
import { QuickTiles } from "@/components/home/QuickTiles";
import { WhatToEatCard } from "@/components/home/WhatToEatCard";
import { findCity } from "@/domain/map/map";
import { recommendationsFor, versusAverage, ymdIn } from "@/domain/health/health";
import { getActiveVybe } from "@/server/health";

const INTENTS = [
  { href: "/explore?intent=eat", title: "Eat", line: "Find the best actual dish near you", tone: "text-orange" },
  { href: "/explore?intent=drink", title: "Drink", line: "Cocktails, happy hour, lounges", tone: "text-coral" },
  { href: "/vybe/new", title: "Link Up", line: "Plan a night your whole crew can enjoy", tone: "text-sky" },
];

const FEEDS = [
  { key: "following", label: "Following" },
  { key: "creators", label: "Creators" },
] as const;

type Search = { searchParams: Promise<{ feed?: string; before?: string; city?: string }> };

export default async function HomePage({ searchParams }: Search) {
  const viewer = await getViewer();
  const { feed: feedParam, before, city: cityParam } = await searchParams;
  const feed = feedParam === "creators" || !viewer ? "creators" : "following";
  const birth = viewer?.birthdate ? parseYmd(viewer.birthdate) : null;
  const bday = birth ? birthdayStatus(birth, todayIn()) : null;
  const citySlug = viewer ? await getViewerCity(viewer, cityParam) : null;
  const tz = findCity(citySlug).timezone;
  const [page, map, active] = await Promise.all([
    getFeed(feed === "following" && viewer ? { kind: "following", viewerId: viewer.id } : { kind: "creators" }, before),
    viewer && citySlug ? getMapData(citySlug, viewer) : Promise.resolve(null),
    viewer ? getActiveVybe(viewer.id, ymdIn(tz), tz, 8) : Promise.resolve(null),
  ]);
  const steps = active?.today?.steps ?? null;
  const badge = active ? versusAverage(steps, active.history.slice(0, -1).map((h) => h.steps)) : null;
  const dayType = active ? recommendationsFor(steps, active.goal, active.today?.activeMinutes ?? null).dayType : "custom";
  const heroPhoto = map?.venues.find((v) => v.photo && !v.photo.isAlcoholic)?.photo?.src ?? "/demo/plate-wings.webp";

  return (
    <div className="flex flex-col gap-6">
      {viewer ? (
        <section aria-label="Start here" className="flex flex-col gap-4">
          <div className="flex justify-center md:hidden">
            <Image src="/brand-wordmark.webp" alt="VYBR8. Eat, drink, link up." width={600} height={200} priority className="h-auto w-44 mix-blend-lighten" />
          </div>
          <form action="/search" className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-coral/60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 shrink-0 text-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <label htmlFor="home-q" className="sr-only">Search VYBR8</label>
            <input id="home-q" name="q" placeholder="What are we eating today?" className="min-h-14 flex-1 bg-transparent text-base placeholder:text-muted focus:outline-none" />
            <Link href="/search" aria-label="Search filters" className="grid size-10 place-items-center rounded-xl bg-surface-2 text-muted hover:text-text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
            </Link>
          </form>
          <QuickTiles tiles={[
            { href: "#nearby", label: "Near Me", tone: "text-coral", icon: "pin" },
            { href: "/vybe", label: "Link Ups", tone: "text-sky", icon: "people" },
            { href: "/charts", label: "Charts", tone: "text-orange", icon: "trophy" },
            { href: "/food-trucks", label: "Food Trucks", tone: "text-mint", icon: "truck" },
          ]} />
          <ActiveVybeCard steps={steps} goal={active?.goal ?? 10000} badge={badge} />
          <WhatToEatCard href={`/health/plan?type=${dayType}`} photo={heroPhoto} />
          <QuickTiles tiles={[
            { href: "/charts?tab=food", label: "Big Back", tone: "text-orange", icon: "plate" },
            { href: "/charts?tab=drinks", label: "Liquid Lover", tone: "text-coral", icon: "glass" },
            { href: "/birthday", label: "Birthday Perks", tone: "text-lavender", icon: "cake" },
            { href: "/places/new", label: "Add a Place", tone: "text-sky", icon: "plus" },
          ]} />
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <Image src="/brand-wordmark.webp" alt="VYBR8. Eat, drink, link up." width={600} height={200} priority className="h-auto w-56 mix-blend-lighten md:hidden" />
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
            What&rsquo;s your <span className="vybe-text">vybe</span> tonight?
          </h1>
          <p className="max-w-prose text-muted">
            For the Big Backs and the Liquid Lovers. Find the best actual plate or pour near you, see what your people are eating and drinking, and link up somewhere everyone can order.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/auth/sign-up" className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Find My Vybe</Link>
            <Link href="/auth/sign-in" className="inline-flex min-h-11 items-center rounded-full border border-line px-6 text-sm font-bold hover:bg-surface-2">Sign in</Link>
          </div>
        </section>
      )}

      {viewer && map ? (
        <section id="nearby" aria-label="Nearby" className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold">Nearby right now</h2>
            <PostButton />
          </div>
          <VybeMap data={map} cities={CITIES.map((c) => ({ slug: c.slug, name: c.name }))} mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null} />
          <VybeStatus city={map.city.slug} mine={map.myStatus} canDrink={viewer.is21Plus} />
        </section>
      ) : (
        <VybeWave />
      )}

      {bday && bday.kind !== "later" && (
        <Link href="/birthday" className="vybe-ring flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] p-5 hover:bg-surface-2">
          <span>
            <span className="block font-display text-xl font-extrabold">
              {bday.kind === "today" ? "Happy birthday!" : <>Your birthday is in <span className="vybe-text">{bday.days} {bday.days === 1 ? "day" : "days"}</span></>}
            </span>
            <span className="text-sm text-muted">{bday.kind === "today" ? "Your birthday perks are ready." : `${formatMonthDay(bday.date)} · see every place with free food, drinks and discounts.`}</span>
          </span>
          <span className="text-sm font-bold text-sky">Birthday Perks →</span>
        </Link>
      )}


      {!viewer && (
        <section aria-label="Start with what you want" className="grid gap-3 sm:grid-cols-3">
          {INTENTS.map((i) => (
            <Link key={i.title} href={i.href} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 transition hover:border-coral/50 hover:bg-surface-2">
              <p className={`font-display text-2xl font-bold ${i.tone}`}>{i.title}</p>
              <p className="mt-1 text-sm text-muted">{i.line}</p>
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="timeline-h" className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 id="timeline-h" className="text-xl font-bold">{viewer ? "Your timeline" : "Fresh from VYBR8 creators"}</h2>
        {viewer && <FeedTabs tabs={FEEDS} active={feed} base="/" />}
        {page.posts.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-muted">
            {feed === "following" ? (
              <>Follow creators and add friends to fill your timeline. <Link href="/explore" className="font-semibold text-sky">Find creators on Explore</Link></>
            ) : (
              <>No creator posts yet.</>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-5">
            {page.posts.map((p, i) => (
              <li key={p.id}><PostCard post={p} signedIn={!!viewer} priority={i === 0} /></li>
            ))}
          </ul>
        )}
        {page.nextCursor && (
          <Link href={`/?feed=${feed}&before=${encodeURIComponent(page.nextCursor)}`} className="self-center rounded-full border border-line px-5 py-2.5 text-sm font-bold hover:bg-surface-2">
            Load more
          </Link>
        )}
      </section>
    </div>
  );
}
