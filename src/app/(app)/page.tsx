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
  const [page, map] = await Promise.all([
    getFeed(feed === "following" && viewer ? { kind: "following", viewerId: viewer.id } : { kind: "creators" }, before),
    viewer ? getViewerCity(viewer, cityParam).then((slug) => getMapData(slug, viewer)) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5">
        <Image src="/brand-wordmark.webp" alt="VYBR8. Eat, drink, link up." width={600} height={200} priority className="h-auto w-56 mix-blend-lighten md:hidden" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
            What&rsquo;s your <span className="vybe-text">vybe</span> tonight?
          </h1>
          {viewer && <PostButton />}
        </div>
        {!viewer && (
          <>
            <p className="max-w-prose text-muted">
              For the Big Backs and the Liquid Lovers. Find the best actual plate or pour near you, see what your people are eating and drinking, and link up somewhere everyone can order.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/auth/sign-up" className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Find My Vybe</Link>
              <Link href="/auth/sign-in" className="inline-flex min-h-11 items-center rounded-full border border-line px-6 text-sm font-bold hover:bg-surface-2">Sign in</Link>
            </div>
          </>
        )}
      </section>

      {viewer && map ? (
        <>
          <VybeMap data={map} cities={CITIES.map((c) => ({ slug: c.slug, name: c.name }))} mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null} />
          <VybeStatus city={map.city.slug} mine={map.myStatus} canDrink={viewer.is21Plus} />
        </>
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
