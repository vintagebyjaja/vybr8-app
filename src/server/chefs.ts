import "server-only";
import { cache } from "react";
import {
  ATTRIBUTION_LABEL, NOT_ENOUGH_REVIEWS, RELATIONSHIP_LABEL, SERVICE_LABELS, canShowChefScores, isCurrent, matchesFilters, readSocials,
  type AvailabilityStatus, type ChefAttribution, type ChefFilters, type ChefPriceType, type ChefService, type RelationshipSource, type SocialLink,
} from "@/domain/chefs/chefs";
import { CITIES } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const cityName = (slug: string | null) => (slug ? CITIES.find((c) => c.slug === slug)?.name ?? null : null);
const num = (v: unknown) => (v == null ? null : Number(v));

// ── Directory ─────────────────────────────────────────────────────────
export type ChefCard = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  photoUrl: string | null;
  citySlug: string | null;
  cityName: string | null;
  areaSlugs: string[];
  serviceArea: string | null;
  services: ChefService[];
  specialties: string[];
  accepting: boolean;
  availableEvents: boolean;
  availableCatering: boolean;
  availablePrivateDining: boolean;
  availableMealPrep: boolean;
  restaurantOnly: boolean;
  startingCents: number | null;
  perPersonCents: number | null;
  hourlyCents: number | null;
  customQuote: boolean;
  minGuests: number | null;
  maxGuests: number | null;
  verified: boolean;
  isDemo: boolean;
};

const CARD_COLUMNS =
  "id, slug, professional_name, headline, photo_url, city_slug, service_area, accepting_clients, available_events, available_catering, available_private_dining, available_meal_prep, restaurant_only, starting_price_cents, per_person_cents, hourly_cents, custom_quote, min_guests, max_guests, verification, is_demo, services:chef_services ( service ), specialties:chef_specialties ( cuisine ), areas:chef_service_areas ( city_slug )";

type CardRow = {
  id: string; slug: string; professional_name: string; headline: string | null; photo_url: string | null; city_slug: string | null; service_area: string | null;
  accepting_clients: boolean; available_events: boolean; available_catering: boolean; available_private_dining: boolean; available_meal_prep: boolean; restaurant_only: boolean;
  starting_price_cents: number | null; per_person_cents: number | null; hourly_cents: number | null; custom_quote: boolean;
  min_guests: number | null; max_guests: number | null; verification: "unverified" | "pending" | "verified"; is_demo: boolean;
  services: { service: ChefService }[] | null; specialties: { cuisine: string }[] | null; areas: { city_slug: string }[] | null;
};

function toCard(r: CardRow): ChefCard {
  return {
    id: r.id, slug: r.slug, name: r.professional_name, headline: r.headline, photoUrl: r.photo_url,
    citySlug: r.city_slug, cityName: cityName(r.city_slug), serviceArea: r.service_area,
    services: (r.services ?? []).map((s) => s.service).sort((a, b) => Object.keys(SERVICE_LABELS).indexOf(a) - Object.keys(SERVICE_LABELS).indexOf(b)),
    specialties: (r.specialties ?? []).map((s) => s.cuisine),
    areaSlugs: (r.areas ?? []).map((a) => a.city_slug),
    accepting: r.accepting_clients, availableEvents: r.available_events, availableCatering: r.available_catering,
    availablePrivateDining: r.available_private_dining, availableMealPrep: r.available_meal_prep, restaurantOnly: r.restaurant_only,
    startingCents: r.starting_price_cents, perPersonCents: r.per_person_cents, hourlyCents: r.hourly_cents, customQuote: r.custom_quote,
    minGuests: r.min_guests, maxGuests: r.max_guests, verified: r.verification === "verified", isDemo: r.is_demo,
  };
}

/** Listed chefs matching the filters. Simple filters run in SQL; services, cuisines, areas and budget in TS. */
export async function listChefs(filters: ChefFilters): Promise<ChefCard[]> {
  const supabase = await createClient();
  let q = supabase.from("chef_profiles").select(CARD_COLUMNS).eq("is_listed", true);
  if (filters.accepting) q = q.eq("accepting_clients", true);
  const { data } = await q.order("verification", { ascending: false }).order("professional_name").limit(300);
  return ((data ?? []) as unknown as CardRow[])
    .map(toCard)
    .filter((c) => matchesFilters(c, filters));
}

// ── Profile ───────────────────────────────────────────────────────────
export type Workplace = {
  id: string;
  role: string;
  business: { slug: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  source: RelationshipSource;
  sourceLabel: string;
  current: boolean;
};
export type SignatureDish = {
  itemId: string;
  name: string;
  business: { slug: string; name: string } | null;
  types: { type: ChefAttribution; label: string }[];
  sourceLabel: string;
  avgScore: number | null;
  ratingCount: number;
};
export type Package = { id: string; name: string; description: string | null; priceType: ChefPriceType; priceCents: number | null; minGuests: number | null; maxGuests: number | null };
export type AvailabilityDay = { day: string; status: AvailabilityStatus; note: string | null };
export type ReviewStats = {
  count: number;
  showScores: boolean;
  /** Shown instead of averages when there aren't enough reviews yet. */
  message: string | null;
  scores: { foodQuality: number | null; professionalism: number | null; communication: number | null; presentation: number | null; timeliness: number | null; value: number | null; wouldBookAgainPct: number | null } | null;
};
export type ChefReview = {
  id: string;
  service: ChefService;
  foodQuality: number;
  professionalism: number | null; communication: number | null; presentation: number | null; timeliness: number | null; value: number | null;
  wouldBookAgain: boolean | null;
  body: string | null;
  eventDate: string | null;
  createdAt: string;
  reviewer: { username: string; name: string; avatarUrl: string | null } | null;
};

export type ChefDetail = ChefCard & {
  userId: string | null;
  bio: string | null;
  coverUrl: string | null;
  yearsExperience: number | null;
  culinaryBackground: string | null;
  website: string | null;
  bookingUrl: string | null;
  contactEmail: string | null;
  socials: SocialLink[];
  verification: "unverified" | "pending" | "verified";
  isListed: boolean;
  specialtyRows: { cuisine: string; isDietary: boolean }[];
  currentWorkplaces: Workplace[];
  formerWorkplaces: Workplace[];
  signatureDishes: SignatureDish[];
  portfolio: { id: string; imageUrl: string; caption: string | null }[];
  packages: Package[];
  availability: AvailabilityDay[];
  reviewStats: ReviewStats;
  reviews: ChefReview[];
  isOwner: boolean;
};

const DETAIL_COLUMNS = `${CARD_COLUMNS}, user_id, bio, cover_url, years_experience, culinary_background, website, booking_url, contact_email, socials, is_listed, specialty_rows:chef_specialties ( cuisine, is_dietary )`;

type DetailRow = CardRow & {
  user_id: string | null; bio: string | null; cover_url: string | null; years_experience: number | null; culinary_background: string | null;
  website: string | null; booking_url: string | null; contact_email: string | null; socials: unknown; is_listed: boolean;
  specialty_rows: { cuisine: string; is_dietary: boolean }[] | null;
};

async function loadDetail(row: DetailRow, viewerId: string | null): Promise<ChefDetail> {
  const supabase = await createClient();
  const now = today();
  const chefId = row.id;
  const [rels, credits, portfolio, packages, availability, stats, reviews] = await Promise.all([
    supabase.from("chef_business_relationships").select("id, role, start_date, end_date, verification_status, business:businesses ( slug, name )").eq("chef_id", chefId).order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("chef_menu_item_attributions").select("menu_item_id, attribution_type, verification_status, end_date, item:menu_items ( id, name, business:businesses ( slug, name ) )").eq("chef_id", chefId).neq("verification_status", "self_reported"),
    supabase.from("chef_portfolio_items").select("id, image_url, caption").eq("chef_id", chefId).order("position").order("created_at").limit(24),
    supabase.from("chef_service_packages").select("id, name, description, price_type, price_cents, min_guests, max_guests").eq("chef_id", chefId).order("position"),
    supabase.from("chef_availability").select("day, status, note").eq("chef_id", chefId).gte("day", now).lte("day", addDays(now, 30)).order("day"),
    supabase.from("chef_review_stats").select("*").eq("chef_id", chefId).maybeSingle(),
    supabase.from("chef_reviews")
      .select("id, service, food_quality, professionalism, communication, presentation, timeliness, value, would_book_again, body, event_date, created_at, reviewer:profiles!chef_reviews_reviewer_id_fkey ( username, display_name, avatar_url )")
      .eq("chef_id", chefId).eq("status", "published").order("created_at", { ascending: false }).limit(10),
  ]);

  // Workplaces: exactly what's recorded, each with who said so. Never inferred.
  type RelRow = { id: string; role: string; start_date: string | null; end_date: string | null; verification_status: RelationshipSource; business: { slug: string; name: string } | null };
  const workplaces: Workplace[] = ((rels.data ?? []) as unknown as RelRow[]).map((r) => ({
    id: r.id, role: r.role, business: r.business, startDate: r.start_date, endDate: r.end_date,
    source: r.verification_status, sourceLabel: RELATIONSHIP_LABEL[r.verification_status], current: isCurrent(r.end_date, now),
  }));

  // Signature dishes: only credits from the business, the VYBR8 Team or a trusted provider, still current.
  type CreditRow = { menu_item_id: string; attribution_type: ChefAttribution; verification_status: RelationshipSource; end_date: string | null; item: { id: string; name: string; business: { slug: string; name: string } | null } | null };
  const creditRows = ((credits.data ?? []) as unknown as CreditRow[]).filter((c) => c.item && c.verification_status !== "self_reported" && isCurrent(c.end_date, now));
  const byItem = new Map<string, SignatureDish>();
  for (const c of creditRows) {
    const existing = byItem.get(c.menu_item_id);
    const type = { type: c.attribution_type, label: ATTRIBUTION_LABEL[c.attribution_type] };
    if (existing) existing.types.push(type);
    else byItem.set(c.menu_item_id, { itemId: c.item!.id, name: c.item!.name, business: c.item!.business, types: [type], sourceLabel: RELATIONSHIP_LABEL[c.verification_status], avgScore: null, ratingCount: 0 });
  }
  if (byItem.size) {
    const { data: itemStats } = await supabase.from("menu_item_stats").select("menu_item_id, avg_score, rating_count").in("menu_item_id", [...byItem.keys()]);
    for (const s of (itemStats ?? []) as { menu_item_id: string; avg_score: number | string | null; rating_count: number }[]) {
      const d = byItem.get(s.menu_item_id);
      if (d) { d.avgScore = num(s.avg_score); d.ratingCount = s.rating_count ?? 0; }
    }
  }
  const signatureDishes = [...byItem.values()].sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || a.name.localeCompare(b.name));

  const s = stats.data as Record<string, unknown> | null;
  const count = (s?.review_count as number | undefined) ?? 0;
  const showScores = canShowChefScores(count);
  const reviewStats: ReviewStats = {
    count, showScores,
    message: showScores ? null : NOT_ENOUGH_REVIEWS,
    scores: showScores && s ? {
      foodQuality: num(s.food_quality), professionalism: num(s.professionalism), communication: num(s.communication),
      presentation: num(s.presentation), timeliness: num(s.timeliness), value: num(s.value), wouldBookAgainPct: num(s.would_book_again_pct),
    } : null,
  };

  type ReviewRow = {
    id: string; service: ChefService; food_quality: number; professionalism: number | null; communication: number | null; presentation: number | null;
    timeliness: number | null; value: number | null; would_book_again: boolean | null; body: string | null; event_date: string | null; created_at: string;
    reviewer: { username: string; display_name: string | null; avatar_url: string | null } | null;
  };

  const card = toCard(row);
  return {
    ...card,
    userId: row.user_id, bio: row.bio, coverUrl: row.cover_url, yearsExperience: row.years_experience, culinaryBackground: row.culinary_background,
    website: row.website, bookingUrl: row.booking_url, contactEmail: row.contact_email, socials: readSocials(row.socials),
    verification: row.verification, isListed: row.is_listed,
    specialtyRows: (row.specialty_rows ?? []).map((r) => ({ cuisine: r.cuisine, isDietary: r.is_dietary })),
    currentWorkplaces: workplaces.filter((w) => w.current),
    formerWorkplaces: workplaces.filter((w) => !w.current),
    signatureDishes,
    portfolio: ((portfolio.data ?? []) as { id: string; image_url: string; caption: string | null }[]).map((p) => ({ id: p.id, imageUrl: p.image_url, caption: p.caption })),
    packages: ((packages.data ?? []) as { id: string; name: string; description: string | null; price_type: ChefPriceType; price_cents: number | null; min_guests: number | null; max_guests: number | null }[])
      .map((p) => ({ id: p.id, name: p.name, description: p.description, priceType: p.price_type, priceCents: p.price_cents, minGuests: p.min_guests, maxGuests: p.max_guests })),
    availability: ((availability.data ?? []) as { day: string; status: AvailabilityStatus; note: string | null }[]).map((a) => ({ day: a.day, status: a.status, note: a.note })),
    reviewStats,
    reviews: ((reviews.data ?? []) as unknown as ReviewRow[]).map((r) => ({
      id: r.id, service: r.service, foodQuality: r.food_quality, professionalism: r.professionalism, communication: r.communication,
      presentation: r.presentation, timeliness: r.timeliness, value: r.value, wouldBookAgain: r.would_book_again, body: r.body,
      eventDate: r.event_date, createdAt: r.created_at,
      reviewer: r.reviewer ? { username: r.reviewer.username, name: r.reviewer.display_name || r.reviewer.username, avatarUrl: r.reviewer.avatar_url } : null,
    })),
    isOwner: !!viewerId && row.user_id === viewerId,
  };
}

/** A chef's public profile. RLS shows unlisted profiles only to their owner and the VYBR8 Team. */
export const getChef = cache(async (slug: string, viewerId: string | null): Promise<ChefDetail | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(slug) || slug.length > 80) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("chef_profiles").select(DETAIL_COLUMNS).eq("slug", slug.toLowerCase()).maybeSingle();
  if (!data) return null;
  return loadDetail(data as unknown as DetailRow, viewerId);
});

export type MyChefProfile = ChefDetail & {
  verificationRequests: { id: string; method: string; status: string; createdAt: string }[];
};

/** The viewer's own Chef Profile with everything the dashboard edits, or null. */
export async function getMyChefProfile(viewerId: string): Promise<MyChefProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("chef_profiles").select(DETAIL_COLUMNS).eq("user_id", viewerId).maybeSingle();
  if (!data) return null;
  const detail = await loadDetail(data as unknown as DetailRow, viewerId);
  const { data: reqs } = await supabase.from("chef_verifications").select("id, method, status, created_at").eq("chef_id", detail.id).order("created_at", { ascending: false }).limit(5);
  return {
    ...detail,
    verificationRequests: ((reqs ?? []) as { id: string; method: string; status: string; created_at: string }[]).map((r) => ({ id: r.id, method: r.method, status: r.status, createdAt: r.created_at })),
  };
}
