import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PerkCard } from "@/components/birthday/PerkCard";
import { PostButton } from "@/components/posts/PostButton";
import { PostGrid } from "@/components/posts/PostGrid";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getBirthdayPerks } from "@/server/birthday";
import { getFeed } from "@/server/posts";
import { getMenu, getPlaceStats } from "@/server/menus";
import { MenuList } from "@/components/menu/MenuList";
import { RatePlace } from "@/components/ratings/RatePlace";

type Params = { params: Promise<{ slug: string }> };

const KIND_LABEL: Record<string, string> = {
  restaurant: "Restaurant", bar: "Bar", cocktail_lounge: "Cocktail lounge", lounge: "Lounge", cigar_lounge: "Cigar lounge",
  hookah_lounge: "Hookah lounge", cafe: "Coffee shop", tea_shop: "Tea & matcha", juice_bar: "Juice & lemonade", bakery: "Bakery", food_truck: "Food truck", brewery: "Brewery", nightlife: "Nightlife",
};

async function loadVenue(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, name, kind, description, price_level, website, is_demo, locations:business_locations ( label, city, region, is_primary )")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params) {
  const venue = await loadVenue((await params).slug);
  return { title: venue?.name ?? "Venue" };
}

export default async function VenuePage({ params }: Params) {
  const { slug } = await params;
  const venue = await loadVenue(slug);
  if (!venue) notFound();
  const viewerP = getViewer();
  const [viewer, page, perks, menu, stats, chefRows] = await Promise.all([
    viewerP,
    getFeed({ kind: "business", businessId: venue.id as string }),
    getBirthdayPerks({ businessId: venue.id as string }),
    viewerP.then((v) => getMenu(venue.id as string, v?.id ?? null)),
    getPlaceStats(venue.id as string),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("chef_business_relationships")
        .select("role, end_date, verification_status, chef:chef_profiles ( slug, professional_name )")
        .eq("business_id", venue.id as string);
      const today = new Date().toISOString().slice(0, 10);
      return ((data ?? []) as unknown as { role: string; end_date: string | null; verification_status: string; chef: { slug: string; professional_name: string } | null }[])
        .filter((r) => r.chef && (!r.end_date || r.end_date >= today));
    })(),
  ]);
  if (venue.kind === "food_truck") redirect(`/food-trucks/${venue.slug}`);
  const locations = (venue.locations ?? []) as { label: string | null; city: string; region: string; is_primary: boolean }[];
  const primary = locations.find((l) => l.is_primary) ?? locations[0];
  const plates = page.posts.filter((p) => p.kind === "plate").length;
  const pours = page.posts.filter((p) => p.kind === "pour").length;

  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-faint">
          <span>{KIND_LABEL[venue.kind as string] ?? venue.kind}</span>
          {venue.price_level && <span aria-label={`Price level ${venue.price_level} of 4`}>· {"$".repeat(venue.price_level as number)}</span>}
          {primary && <span>· {primary.label ? `${primary.label}, ` : ""}{primary.city}, {primary.region}</span>}
          {venue.is_demo && <DemoBadge label="Demo venue" />}
        </div>
        <h1 className="text-4xl font-extrabold">{venue.name}</h1>
        {venue.description && <p className="max-w-prose text-muted">{venue.description}</p>}
        <div className="flex flex-wrap gap-3 pt-1">
          <PostButton href={viewer ? `/post/new?venue=${venue.slug}` : `/auth/sign-in?next=/post/new?venue=${venue.slug}`} label="Post your plate here" />
          {venue.website && (
            <a href={venue.website as string} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">
              Website
            </a>
          )}
        </div>
      </header>

      <section aria-labelledby="reviews-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="reviews-h" className="text-xl font-bold">Ratings</h2>
          {viewer && <RatePlace businessId={venue.id as string} returnTo={`/venue/${venue.slug}`} />}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["Overall", stats.overall], ["Service Vybe", stats.serviceVybe], ["Value", stats.value], ["Aesthetic", stats.aesthetic]] as const).map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-4 text-center">
              <dt className="text-xs font-bold uppercase tracking-wide text-faint">{k}</dt>
              <dd className="font-display text-2xl font-extrabold">{v != null ? <span className="vybe-text">{v.toFixed(1)}</span> : <span className="text-faint">–</span>}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-faint">{stats.count ? `${stats.count} ${stats.count === 1 ? "rating" : "ratings"} of the place.` : "No ratings of the place yet."} Dishes and drinks are rated one by one below.</p>
        {chefRows.length > 0 && (
          <p className="text-sm">
            <span className="text-muted">In the kitchen:</span>{" "}
            {chefRows.map((r, i) => <span key={r.chef!.slug}>{i > 0 && ", "}<Link href={`/chef/${r.chef!.slug}`} className="font-semibold text-sky">{r.chef!.professional_name}</Link> <span className="text-muted">({r.role}{r.verification_status === "self_reported" ? ", self-reported" : ""})</span></span>)}
          </p>
        )}
      </section>

      <section aria-labelledby="menu-h" className="flex flex-col gap-3">
        <h2 id="menu-h" className="text-xl font-bold">Menu &amp; VYBR8 scores</h2>
        <MenuList items={menu} signedIn={!!viewer} returnTo={`/venue/${venue.slug}`} />
      </section>

      {perks.length > 0 && (
        <section aria-labelledby="perks-h" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="perks-h" className="text-xl font-bold">Birthday perks</h2>
            <Link href="/birthday" className="text-sm font-semibold text-sky hover:underline">All birthday perks</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {perks.map((p) => <li key={p.id}><PerkCard perk={p} showVenue={false} /></li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="plates-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="plates-h" className="text-xl font-bold">Plates &amp; Pours</h2>
          <p className="text-sm text-muted tabular-nums">{plates} plates · {pours} pours</p>
        </div>
        <PostGrid
          posts={page.posts}
          empty={<>No one has posted from here yet. <Link href={`/post/new?venue=${venue.slug}`} className="font-semibold text-sky">Be the first</Link></>}
        />
      </section>
    </article>
  );
}
