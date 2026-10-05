import Link from "next/link";
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "@/domain/places/osm";
import { openStatus, weekSchedule } from "@/domain/map/hours";
import { notFound, redirect } from "next/navigation";
import { PerkCard } from "@/components/birthday/PerkCard";
import { PostButton } from "@/components/posts/PostButton";
import { LinkUpHere } from "@/components/linkups/LinkUpHere";
import { ShareButton } from "@/components/share/ShareButton";
import { PostGrid } from "@/components/posts/PostGrid";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getBirthdayPerks } from "@/server/birthday";
import { getFeed } from "@/server/posts";
import { getMenu, getPlaceStats } from "@/server/menus";
import { MenuList } from "@/components/menu/MenuList";
import { PlaceLinks } from "@/components/places/PlaceLinks";
import { getPlaceLinks } from "@/server/place-links";
import { RatePlace } from "@/components/ratings/RatePlace";
import { ApprovedBadge } from "@/components/places/ApprovedBadge";
import { placeTitle } from "@/domain/places/places";
import { claimBadge, reportClosed, reviewClosure, setBrand, setPlaceList, submitHours } from "@/app/(app)/places/actions";
import { PLACE_BADGES, badgeInfo } from "@/domain/places/badges";
import { HoursEditor } from "@/components/places/HoursEditor";
import { RankBadge } from "@/components/charts/RankBadge";
import { findCity, localClock, type Hours } from "@/domain/map/map";
import { ranksForBusiness } from "@/server/charts";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ added?: string; closed?: string; hours?: string; badge?: string; link_saved?: string; link_error?: string }> };

const KIND_LABEL: Record<string, string> = {
  restaurant: "Restaurant", bar: "Bar", cocktail_lounge: "Cocktail lounge", lounge: "Lounge", cigar_lounge: "Cigar lounge",
  hookah_lounge: "Hookah lounge", cafe: "Coffee shop", tea_shop: "Tea & matcha", juice_bar: "Juice & lemonade", bakery: "Bakery", food_truck: "Food truck", brewery: "Brewery", nightlife: "Nightlife",
};

async function loadVenue(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, name, branch_name, kind, description, price_level, website, phone, source, is_demo, is_claimed, status, closed_at, brand_id, brand:brands ( name ), locations:business_locations ( id, label, address_line1, city, city_slug, region, postal_code, is_primary, timezone, hours:business_hours ( weekday, opens_at, closes_at ) )")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params) {
  const venue = await loadVenue((await params).slug);
  return { title: venue ? placeTitle(venue.name as string, venue.branch_name as string | null) : "Venue" };
}

export default async function VenuePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { added, closed, hours: hoursMsg, badge: badgeMsg, link_saved: linkSaved, link_error: linkError } = await searchParams;
  const venue = await loadVenue(slug);
  if (!venue) notFound();
  const viewerP = getViewer();
  const citySlug = ((venue.locations ?? []) as { city_slug: string | null; is_primary: boolean }[]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.city_slug ?? null;
  const [viewer, page, perks, menu, stats, chefRows, siblings, ranks] = await Promise.all([
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
    // Other locations of the same franchise brand.
    (async () => {
      if (!venue.brand_id) return [];
      const supabase = await createClient();
      const { data } = await supabase
        .from("businesses")
        .select("slug, name, branch_name, is_claimed, locations:business_locations ( address_line1, city, region )")
        .eq("brand_id", venue.brand_id as string)
        .eq("status", "active")
        .neq("id", venue.id as string)
        .is("deleted_at", null)
        .order("name")
        .limit(12);
      return (data ?? []) as unknown as { slug: string; name: string; branch_name: string | null; is_claimed: boolean; locations: { address_line1: string | null; city: string; region: string }[] }[];
    })(),
    citySlug ? ranksForBusiness(venue.id as string, citySlug, findCity(citySlug).name) : Promise.resolve({ place: null, items: {} }),
  ]);
  if (venue.kind === "food_truck") redirect(`/food-trucks/${venue.slug}`);
  const locations = (venue.locations ?? []) as { id: string; label: string | null; address_line1: string | null; city: string; city_slug: string | null; region: string; postal_code: string | null; is_primary: boolean; timezone: string; hours: { weekday: number; opens_at: string; closes_at: string }[] | null }[];
  const brand = (Array.isArray(venue.brand) ? venue.brand[0] : venue.brand) as { name: string } | null;
  const isStaff = !!viewer?.platformRoles.length;
  const { data: canEditRaw } = viewer && !isStaff ? await (await createClient()).rpc("can_edit_place", { p_business: venue.id }) : { data: null };
  const canEditHours = isStaff || canEditRaw === true;
  const { data: badgeRows } = await (await createClient()).from("place_badges").select("badge, status, from_owner").eq("business_id", venue.id);
  const badges = (badgeRows ?? []) as { badge: string; status: string; from_owner: boolean }[];
  const verifiedBadges = badges.filter((b) => b.status === "verified");
  const { data: myList } = viewer ? await (await createClient()).from("place_lists").select("list").eq("business_id", venue.id).maybeSingle() : { data: null };
  const listed = (myList as { list: "saved" | "never" } | null)?.list ?? null;
  const pendingBadges = badges.filter((b) => b.status === "pending");
  const [links, { data: membership }] = await Promise.all([
    getPlaceLinks([venue.id as string], viewer?.id ?? null),
    viewer ? (await createClient()).from("business_members").select("role").eq("business_id", venue.id).eq("user_id", viewer.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const canManageLinks = isStaff || ["owner", "manager"].includes(String((membership as { role?: string } | null)?.role ?? ""));
  const primary = locations.find((l) => l.is_primary) ?? locations[0];
  const hours: Hours[] = (primary?.hours ?? []).map((h) => ({ weekday: h.weekday, opensAt: h.opens_at, closesAt: h.closes_at }));
  const status = primary ? openStatus(hours, primary.timezone) : null;
  const week = weekSchedule(hours);
  const todayDow = primary ? localClock(primary.timezone, new Date()).weekday : -1;
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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-extrabold">{placeTitle(venue.name as string, venue.branch_name as string | null)}</h1>
          {venue.is_claimed && <ApprovedBadge />}
        </div>
        {verifiedBadges.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Verified by VYBR8">
            {verifiedBadges.map((b) => { const info = badgeInfo(b.badge); return info ? (
              <li key={b.badge}><Link href={`/eat?city=${primary?.city_slug ?? ""}&badge=${b.badge}`} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${info.tone}`}>{info.label} <span aria-hidden>✓</span></Link></li>
            ) : null; })}
          </ul>
        )}
        {ranks.place && <div><RankBadge badge={ranks.place} /></div>}
        {primary && (
          <p className="text-sm text-muted">
            {primary.address_line1 ? `${primary.address_line1}, ` : ""}{primary.city}, {primary.region}{primary.postal_code ? ` ${primary.postal_code}` : ""}
            {primary.address_line1 && (
              <> · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${primary.address_line1} ${primary.city} ${primary.region}`)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky hover:underline">Directions</a></>
            )}
          </p>
        )}
        {status ? (
          <a href="#hours-h" className={`self-start text-sm font-bold ${status.open ? "text-mint" : "text-coral"}`}>{status.line}</a>
        ) : (
          <a href="#hours-h" className="self-start text-sm text-faint">Hours not listed yet</a>
        )}
        {venue.status === "hidden" && venue.closed_at && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">
            <span>Marked <b>permanently closed</b>. Hidden from lists, the map and search. Only the VYBR8 Team sees this page.</span>
            {isStaff && (
              <form action={reviewClosure}>
                <input type="hidden" name="business" value={venue.id as string} /><input type="hidden" name="closed" value="0" /><input type="hidden" name="back" value={`/venue/${venue.slug}`} />
                <button className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">It&rsquo;s open: bring it back</button>
              </form>
            )}
          </div>
        )}
        {listed === "never" && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
            <span>You marked this <b>Never again</b>. It&rsquo;s hidden from your recommendations, and your groups and Link Up hosts get a heads-up if plans land here.</span>
            <form action={setPlaceList}>
              <input type="hidden" name="business" value={venue.id as string} /><input type="hidden" name="back" value={`/venue/${venue.slug}`} /><input type="hidden" name="list" value="clear" />
              <button className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">Give it another chance</button>
            </form>
          </div>
        )}
        {closed === "reported" && <p role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm">Thanks for the heads up. Once a few people confirm, VYBR8 takes it down.</p>}
        {closed === "error" && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">That didn&rsquo;t go through. Try again.</p>}
        {venue.status === "pending" && (
          <p role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm">
            {added ? "Thanks for adding it! " : ""}The VYBR8 Team is taking a quick look. Only you can see this place until it&rsquo;s live.
          </p>
        )}
        {venue.description && <p className="max-w-prose text-muted">{venue.description}</p>}
        {!venue.is_claimed && !venue.is_demo && (
          <p className="text-sm text-muted">
            Own or manage this location? <Link href={`/venue/${venue.slug}/claim`} className="font-bold text-coral">Claim it</Link> to run the listing and get the VYBR8 Approved badge.
          </p>
        )}
        <div className="flex flex-wrap gap-3 pt-1">
          <PostButton href={viewer ? `/post/new?venue=${venue.slug}` : `/auth/sign-in?next=/post/new?venue=${venue.slug}`} label="Post your plate here" />
          {venue.status === "active" && <LinkUpHere venueSlug={venue.slug as string} signedIn={!!viewer} isAdult={viewer?.isAdult ?? false} />}
          {viewer && venue.status === "active" && listed !== "never" && (
            <form action={setPlaceList}>
              <input type="hidden" name="business" value={venue.id as string} /><input type="hidden" name="back" value={`/venue/${venue.slug}`} />
              <input type="hidden" name="list" value={listed === "saved" ? "clear" : "saved"} />
              <button className={`inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold ${listed === "saved" ? "bg-coral text-ink" : "border border-coral/50 text-coral hover:bg-coral/10"}`}>{listed === "saved" ? "♥ Saved" : "♡ Save"}</button>
            </form>
          )}
          <ShareButton path={`/venue/${venue.slug}`} title={placeTitle(venue.name as string, venue.branch_name as string | null)} text={`Pull up? ${placeTitle(venue.name as string, venue.branch_name as string | null)} on VYBR8`} />
          {venue.website && (
            <a href={venue.website as string} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">
              Website
            </a>
          )}
          {venue.phone && (
            <a href={`tel:${String(venue.phone).replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">
              Call
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

      {siblings.length > 0 && (
        <section aria-labelledby="locs-h" className="flex flex-col gap-3">
          <h2 id="locs-h" className="text-xl font-bold">Other {brand?.name ?? venue.name} locations</h2>
          <p className="text-xs text-faint">Each location has its own ratings, menu and owner.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {siblings.map((b) => {
              const l = b.locations[0];
              return (
                <li key={b.slug}>
                  <Link href={`/venue/${b.slug}`} className="flex flex-col rounded-2xl border border-line bg-surface p-3 hover:bg-surface-2">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">{placeTitle(b.name, b.branch_name)}{b.is_claimed && <ApprovedBadge small />}</span>
                    {l && <span className="text-xs text-muted">{l.address_line1 ? `${l.address_line1}, ` : ""}{l.city}, {l.region}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isStaff && (
        <form action={setBrand} className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-3 text-sm">
          <input type="hidden" name="business" value={venue.id as string} />
          <input type="hidden" name="slug" value={venue.slug as string} />
          <label htmlFor="brand" className="font-semibold text-muted">Team · franchise brand</label>
          <input id="brand" name="brand" defaultValue={brand?.name ?? ""} placeholder="e.g. Chick-fil-A (blank = none)" className="min-h-10 flex-1 rounded-xl border border-line bg-surface px-3" />
          <button className="min-h-10 rounded-full border border-line px-4 font-bold">Save</button>
        </form>
      )}

      <section aria-labelledby="hours-h" className="flex scroll-mt-4 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="hours-h" className="text-xl font-bold">Hours</h2>
          {status && <span className={`text-sm font-bold ${status.open ? "text-mint" : "text-coral"}`}>{status.line}</span>}
        </div>
        {hours.length ? (
          <dl className="grid max-w-md gap-1 rounded-2xl border border-line bg-surface p-4 text-sm">
            {week.map((d) => (
              <div key={d.weekday} className={`flex justify-between gap-4 ${d.weekday === todayDow ? "font-bold text-text" : "text-muted"}`}>
                <dt>{d.name}{d.weekday === todayDow ? " (today)" : ""}</dt>
                <dd className="text-right tabular-nums">{d.ranges.length ? d.ranges.join(", ") : "Closed"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
            Hours aren&rsquo;t listed yet.{" "}
            {!venue.is_claimed && <>Own it? <Link href={`/venue/${venue.slug}/claim`} className="font-semibold text-coral">Claim it</Link> to add your hours. </>}
            Know them? Add them below.
          </p>
        )}
        {hours.length > 0 && <p className="text-xs text-faint">Hours can change on holidays. {venue.source === "osm" && !venue.is_claimed ? "Listed from OpenStreetMap." : ""}</p>}
        {hoursMsg === "saved" && <p role="status" className="text-sm text-mint">Hours saved. They&rsquo;re live.</p>}
        {hoursMsg === "suggested" && <p role="status" className="text-sm text-mint">Thanks! The VYBR8 Team will check the hours and put them up.</p>}
        {hoursMsg === "error" && <p role="alert" className="text-sm text-danger">Those hours didn&rsquo;t save. Check the times and try again.</p>}
        {primary && (viewer ? (
          <details className="max-w-xl rounded-2xl border border-line bg-surface p-4" open={hoursMsg === "error"}>
            <summary className="cursor-pointer list-none text-sm font-bold text-sky">
              {canEditHours ? (hours.length ? "Edit hours" : "Add hours") : hours.length ? "Hours wrong? Suggest a fix" : "Know the hours? Add them"}
            </summary>
            <div className="mt-3">
              <HoursEditor action={submitHours} locationId={primary.id} slug={venue.slug as string} initial={hours} mode={canEditHours ? "save" : "suggest"} />
            </div>
          </details>
        ) : (
          <Link href={`/auth/sign-in?next=/venue/${venue.slug}`} className="text-sm font-semibold text-sky">Know the hours? Sign in to add them</Link>
        ))}
      </section>

      {venue.status === "active" && (
        <section aria-labelledby="badges-h" className="flex scroll-mt-4 flex-col gap-2">
          <h2 id="badges-h" className="sr-only">Owner &amp; cause badges</h2>
          {badgeMsg === "pending" && <p role="status" className="text-sm text-mint">Thanks! The VYBR8 Team verifies every badge before it shows.</p>}
          {badgeMsg === "verified" && <p role="status" className="text-sm text-mint">Badge added and verified.</p>}
          {badgeMsg === "already_verified" && <p role="status" className="text-sm text-muted">That badge is already verified here.</p>}
          {badgeMsg === "error" && <p role="alert" className="text-sm text-danger">That didn&rsquo;t go through. Try again.</p>}
          {pendingBadges.length > 0 && (canEditHours || isStaff) && (
            <p className="text-xs text-faint">Waiting on the VYBR8 Team: {pendingBadges.map((b) => badgeInfo(b.badge)?.label).filter(Boolean).join(", ")}</p>
          )}
          {viewer ? (
            <details className="max-w-xl rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-orange">
                {canEditHours && !isStaff ? "Is your business Black-owned, woman-owned or giving back? Add a badge" : "Black-owned, woman-owned or giving back? Suggest a badge"}
              </summary>
              <form action={claimBadge} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="business" value={venue.id as string} /><input type="hidden" name="slug" value={venue.slug as string} />
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="mb-2 text-sm font-semibold">Which applies?</legend>
                  {PLACE_BADGES.filter((b) => !verifiedBadges.some((v) => v.badge === b.key)).map((b, i) => (
                    <label key={b.key} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm font-semibold has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-ink">
                      <input type="radio" name="badge" value={b.key} required defaultChecked={i === 0} className="sr-only" />{b.label}
                    </label>
                  ))}
                </fieldset>
                <input name="evidence" maxLength={500} placeholder={canEditHours ? "Anything that helps us verify (certification, website page, press)" : "How do you know? A link or a few words helps us verify"} className="min-h-11 rounded-xl border border-line bg-ink px-3 text-sm" />
                <p className="text-xs text-faint">{isStaff ? "As the VYBR8 Team, your badge goes live right away." : "Every badge is checked by the VYBR8 Team before it shows. We never guess who owns a business."}</p>
                <button className="vybe-gradient min-h-11 self-start rounded-full px-6 text-sm font-bold text-ink">{isStaff ? "Add verified badge" : canEditHours ? "Send for verification" : "Suggest this badge"}</button>
              </form>
            </details>
          ) : (
            <Link href={`/auth/sign-in?next=/venue/${venue.slug}`} className="text-sm font-semibold text-orange">Black-owned, woman-owned or giving back? Sign in to add a badge</Link>
          )}
        </section>
      )}

      <PlaceLinks businessId={venue.id as string} name={venue.name as string} cityName={citySlug ? findCity(citySlug).name : ""} kind={venue.kind as string}
        website={(venue.website as string | null) ?? null} links={links.get(venue.id as string) ?? []} signedIn={!!viewer} canManage={canManageLinks}
        back={`/venue/${venue.slug}`} saved={linkSaved === "1"} error={linkError ? String(linkError).slice(0, 160) : null} />

      <section aria-labelledby="menu-h" className="flex flex-col gap-3">
        <h2 id="menu-h" className="text-xl font-bold">Menu &amp; VYBR8 scores</h2>
        {menu.length ? (
          <MenuList items={menu} signedIn={!!viewer} returnTo={`/venue/${venue.slug}`} ranks={ranks.items}
            partial={!venue.is_claimed}
            fullMenuUrl={(links.get(venue.id as string) ?? []).find((l) => l.kind === "menu")?.url ?? (venue.website as string | null) ?? null} />
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
            <p>No menu on VYBR8 yet. {venue.is_claimed ? "The owner can add it from their business page." : "Owners add their full menu, prices and nutrition when they claim this place."}</p>
            <div className="flex flex-wrap gap-2">
              {venue.website && <a href={venue.website as string} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-4 py-2 font-bold text-text hover:bg-surface-2">See their menu on their website</a>}
              <Link href={viewer ? `/post/new?venue=${venue.slug}` : `/auth/sign-in?next=/post/new?venue=${venue.slug}`} className="rounded-full border border-line px-4 py-2 font-bold text-text hover:bg-surface-2">Ate here? Post your plate</Link>
              {!venue.is_claimed && !venue.is_demo && <Link href={`/venue/${venue.slug}/claim`} className="rounded-full border border-coral/50 px-4 py-2 font-bold text-coral">Own it? Claim it</Link>}
            </div>
          </div>
        )}
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

      {viewer && venue.status === "active" && listed !== "never" && (
        <details className="max-w-xl text-sm">
          <summary className="cursor-pointer list-none font-semibold text-muted hover:text-text">Bad experience? Mark it Never again</summary>
          <form action={setPlaceList} className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
            <input type="hidden" name="business" value={venue.id as string} /><input type="hidden" name="back" value={`/venue/${venue.slug}`} /><input type="hidden" name="list" value="never" />
            <p className="text-xs text-muted">It won&rsquo;t show in your recommendations anymore. If a group plan or Link Up you&rsquo;re in is here, the host or group gets a heads-up that you don&rsquo;t want to go back. Your reason stays private.</p>
            <input name="note" maxLength={200} placeholder="What happened? (only you see this)" className="min-h-10 rounded-lg border border-line bg-ink px-3" />
            <button className="self-start rounded-full border border-danger/60 px-4 py-2 font-bold text-danger">Never again</button>
          </form>
        </details>
      )}

      {viewer && venue.status === "active" && (
        <form action={reportClosed} className="flex flex-wrap items-center gap-2 text-xs text-faint">
          <input type="hidden" name="business" value={venue.id as string} /><input type="hidden" name="slug" value={venue.slug as string} />
          {isStaff ? (
            <button className="rounded-full border border-danger/60 px-4 py-2 font-bold text-danger hover:bg-danger/10">Team · Mark permanently closed</button>
          ) : (
            <>Closed for good? <button className="font-semibold underline hover:text-muted">Let us know</button></>
          )}
        </form>
      )}

      {venue.source === "osm" && !venue.is_claimed && (
        <p className="text-xs text-faint">
          Place info from <a href={OSM_COPYRIGHT_URL} className="underline hover:text-muted">{OSM_ATTRIBUTION}</a>. Something off?{" "}
          <Link href={`/venue/${venue.slug}/claim`} className="underline hover:text-muted">Own it? Claim it</Link> or{" "}
          <Link href={`/help?topic=other&from=/venue/${venue.slug}#contact`} className="underline hover:text-muted">tell us</Link>.
        </p>
      )}
    </article>
  );
}
