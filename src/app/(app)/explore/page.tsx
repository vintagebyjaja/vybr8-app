import Link from "next/link";
import { CreatorBadge } from "@/components/posts/Badges";
import { FeedTabs } from "@/components/posts/FeedTabs";
import { PostButton } from "@/components/posts/PostButton";
import { PostGrid } from "@/components/posts/PostGrid";
import { SearchBox } from "@/components/search/SearchBox";
import { ComingSoon } from "@/components/ui/ComingSoon";
import type { PostKind } from "@/domain/posts/posts";
import { getViewer } from "@/server/auth";
import { getFeaturedCreators, getFeed } from "@/server/posts";

export const metadata = { title: "Explore" };

const TABS = [
  { key: "all", label: "All" },
  { key: "plate", label: "Plates" },
  { key: "pour", label: "Pours" },
  { key: "spot", label: "Spots" },
] as const;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const { kind: kindParam, from } = await searchParams;
  const kind = (["plate", "pour", "spot"].includes(kindParam ?? "") ? kindParam : "all") as PostKind | "all";
  const postKind = kind === "all" ? undefined : kind;
  const everyone = from === "everyone";

  const [viewer, creators, page] = await Promise.all([
    getViewer(),
    getFeaturedCreators(),
    getFeed(everyone ? { kind: "recent", postKind } : { kind: "creators", postKind }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Explore</h1>
          <p className="mt-1 text-muted">Plates for the Big Backs. Pours for everyone: coffee, matcha, lemonade, and cocktails for the Liquid Lovers (21+).</p>
        </div>
        {viewer && (
          <div className="flex flex-wrap gap-2">
            <Link href="/places/new" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Add a place</Link>
            <PostButton />
          </div>
        )}
      </header>

      <section aria-label="Discover" className="flex flex-col gap-3">
        <SearchBox />
        <nav aria-label="Discover by" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { href: "/search?tab=food", label: "FOOD", tone: "text-orange" },
            { href: "/search?tab=drinks", label: "DRINKS", tone: "text-coral" },
            { href: "/chefs", label: "CHEFS", tone: "text-lavender" },
            { href: "/food-trucks", label: "FOOD TRUCKS", tone: "text-sky" },
            { href: "/search?tab=nightlife", label: "NIGHTLIFE", tone: "text-lavender" },
          ].map((t) => (
            <Link key={t.label} href={t.href} className={`rounded-2xl border border-line bg-surface p-4 text-center font-display text-sm font-extrabold tracking-wide hover:bg-surface-2 ${t.tone}`}>{t.label}</Link>
          ))}
        </nav>
      </section>

      <section aria-labelledby="creators-h" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="creators-h" className="text-lg font-bold">Verified creators</h2>
          <Link href="/creators/apply" className="text-sm font-semibold text-sky hover:underline">Become a creator</Link>
        </div>
        {creators.length === 0 ? (
          <p className="text-sm text-muted">The first VYBR8 creators are being verified now.</p>
        ) : (
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] md:mx-0 md:px-0">
            {creators.map((c) => (
              <li key={c.username} className="shrink-0">
                <Link href={`/profile/${c.username}`} className="flex w-36 flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-center hover:bg-surface-2">
                  <span aria-hidden className="vybe-gradient grid size-16 place-items-center rounded-full font-display text-2xl font-extrabold text-ink">
                    {(c.displayName ?? c.username).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="w-full truncate text-sm font-bold">{c.displayName ?? c.username}</span>
                  <CreatorBadge type={c.creatorType} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="grid-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="grid-h" className="text-lg font-bold">{everyone ? "Latest from everyone" : "Latest from creators"}</h2>
          <Link href={`/explore?kind=${kind}${everyone ? "" : "&from=everyone"}`} className="text-sm font-semibold text-sky hover:underline">
            {everyone ? "Creators only" : "Show everyone"}
          </Link>
        </div>
        <FeedTabs tabs={TABS} active={kind} base="/explore" param="kind" extra={everyone ? "from=everyone" : undefined} />
        {viewer?.daysUntil21 != null ? (
          <p className="rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm">
            Your 21st is {viewer.daysUntil21 === 0 ? "today" : `in ${viewer.daysUntil21} ${viewer.daysUntil21 === 1 ? "day" : "days"}`}! Pours are unlocked so you can plan where to celebrate.
            {viewer.daysUntil21 > 0 ? " Places only serve alcohol to guests 21+, so save the drinks for your birthday." : ""}
          </p>
        ) : !viewer?.hasPourAccess && (
          <p className="text-xs text-faint">
            {viewer ? "Cocktail and alcohol posts are shown to members 21+, starting 5 days before your 21st birthday. Every place is still on VYBR8." : "Cocktail and alcohol posts are for members 21+. Sign in to see them."}
          </p>
        )}
        <PostGrid posts={page.posts} empty="Nothing here yet. Be the first to post." />
      </section>

      <ComingSoon
        phase="Phase 2 · Local discovery"
        title="Places near you"
        tagline="Restaurants, bars, lounges and more, in a list or on the map, with one set of filters."
        points={["Near Me, Open Now, cuisine, price and tonight's budget", "Delivery, pickup, dine-in and reservations", "Verified community badges: locally owned, Black-owned, woman-owned, veteran-owned, gives back"]}
      />
    </div>
  );
}
