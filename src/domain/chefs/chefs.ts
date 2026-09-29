/**
 * CHEFS: labels, price wording, filters and small helpers. Pure TS, no framework imports.
 * Workplaces and dish credits are never inferred: each one carries who said so.
 */

export const SERVICE_LABELS = {
  private_chef: "Private chef",
  catering: "Catering",
  meal_prep: "Meal prep",
  pop_ups: "Pop-ups",
  classes: "Classes",
  consulting: "Consulting",
  events: "Events",
  restaurant_chef: "Restaurant chef",
  food_truck: "Food truck",
} as const;
export type ChefService = keyof typeof SERVICE_LABELS;
export const CHEF_SERVICES = Object.keys(SERVICE_LABELS) as ChefService[];
/** Services people can review. Restaurant visits are rated on the place and its dishes. */
export const REVIEWABLE_SERVICES: ChefService[] = CHEF_SERVICES.filter((s) => s !== "restaurant_chef");

export const RELATIONSHIP_LABEL = {
  self_reported: "Self-reported",
  business_confirmed: "Confirmed by the business",
  admin_verified: "Verified by VYBR8",
  provider: "From a trusted source",
} as const;
export type RelationshipSource = keyof typeof RELATIONSHIP_LABEL;

export const ATTRIBUTION_LABEL = {
  creator: "Created by",
  executive_chef: "Executive chef",
  head_chef: "Head chef",
  featured_chef: "Featured chef",
  collaborator: "Collaborator",
} as const;
export type ChefAttribution = keyof typeof ATTRIBUTION_LABEL;

export const PRICE_TYPE_LABEL = {
  starting: "Starting price",
  per_person: "Per person",
  hourly: "Hourly",
  package: "Package",
  custom_quote: "Custom quote",
} as const;
export type ChefPriceType = keyof typeof PRICE_TYPE_LABEL;
export const PRICE_TYPES = Object.keys(PRICE_TYPE_LABEL) as ChefPriceType[];

export const AVAILABILITY_LABEL = { available: "Available", limited: "Limited", booked: "Booked" } as const;
export type AvailabilityStatus = keyof typeof AVAILABILITY_LABEL;

export const VERIFICATION_METHODS = {
  business_confirmation: "A restaurant or business I work with can confirm",
  license_or_certificate: "License, food handler card or certificate",
  social_proof: "Social media or press",
  in_person: "Meet the VYBR8 Team in person",
} as const;
export type VerificationMethod = keyof typeof VERIFICATION_METHODS;

export const REVIEW_DIMENSIONS = [
  { key: "food_quality", label: "Food quality", required: true },
  { key: "professionalism", label: "Professionalism", required: false },
  { key: "communication", label: "Communication", required: false },
  { key: "presentation", label: "Presentation", required: false },
  { key: "timeliness", label: "Timeliness", required: false },
  { key: "value", label: "Value", required: false },
] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number]["key"];

/** Chef rankings and averages only show with at least this many reviews. */
export const MIN_CHEF_REVIEWS = 5;
export const NOT_ENOUGH_REVIEWS = "Not enough reviews yet to score";

export function canShowChefScores(reviewCount: number): boolean {
  return reviewCount >= MIN_CHEF_REVIEWS;
}

export function isService(v: unknown): v is ChefService {
  return typeof v === "string" && Object.hasOwn(SERVICE_LABELS, v);
}

/** "$450" or "$12.50". */
export function formatDollars(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString("en-US") : d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ChefPrices = { startingCents: number | null; perPersonCents: number | null; hourlyCents: number | null; customQuote: boolean };

/** Price wording is always an estimate ("From ..."): the chef confirms the real quote. */
export function priceSummary(p: ChefPrices): string[] {
  const out: string[] = [];
  if (p.startingCents != null) out.push(`From ${formatDollars(p.startingCents)}`);
  if (p.perPersonCents != null) out.push(`From ${formatDollars(p.perPersonCents)}/person`);
  if (p.hourlyCents != null) out.push(`From ${formatDollars(p.hourlyCents)}/hour`);
  if (p.customQuote) out.push("Custom quotes");
  return out;
}

/** Package price wording, again as an estimate. */
export function packagePrice(type: ChefPriceType, cents: number | null): string {
  if (type === "custom_quote" || cents == null) return "Custom quote";
  const d = formatDollars(cents);
  if (type === "per_person") return `From ${d} per person`;
  if (type === "hourly") return `From ${d} per hour`;
  if (type === "package") return `From ${d} for the package`;
  return `From ${d}`;
}

/** A workplace or credit is current until its end date has passed. Dates are "YYYY-MM-DD". */
export function isCurrent(endDate: string | null, today: string): boolean {
  return endDate === null || endDate >= today;
}

/** "Chef Simone Reyes!" -> "chef-simone-reyes". Matches the chef_profiles slug check. */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return s || "chef";
}

/** Comma-separated cuisines -> trimmed, de-duplicated (case-insensitive), 2-40 characters each, at most `max`. */
export function parseSpecialties(text: string, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (v.length < 2 || v.length > 40) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export const SOCIAL_KINDS = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" } as const;
export type SocialKind = keyof typeof SOCIAL_KINDS;
export type SocialLink = { kind: SocialKind; url: string };

/** Read the socials jsonb safely: only known kinds with https links. */
export function readSocials(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const { kind, url } = v as { kind?: unknown; url?: unknown };
    return typeof kind === "string" && Object.hasOwn(SOCIAL_KINDS, kind) && typeof url === "string" && /^https:\/\/\S+$/.test(url)
      ? [{ kind: kind as SocialKind, url }]
      : [];
  });
}

// ── Directory filters ──────────────────────────────────────────────────
export type ChefFilters = {
  city: string | null;
  service: ChefService | null;
  cuisine: string | null;
  accepting: boolean;
  /** Dollars. */
  maxBudget: number | null;
  guests: number | null;
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function one(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function positiveInt(v: string | undefined, max: number): number | null {
  if (!v || !/^\d+(\.\d+)?$/.test(v.trim())) return null;
  const n = Math.floor(Number(v));
  return n >= 1 && n <= max ? n : null;
}

/** Reads the directory's GET form. Anything unknown or out of range is ignored. */
export function parseChefFilters(params: Params, citySlugs?: readonly string[]): ChefFilters {
  const city = one(params, "city")?.trim().toLowerCase() || null;
  const service = one(params, "service")?.trim() ?? "";
  const cuisine = (one(params, "cuisine") ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  return {
    city: city && /^[a-z0-9-]{1,40}$/.test(city) && (!citySlugs || citySlugs.includes(city)) ? city : null,
    service: isService(service) ? service : null,
    cuisine: cuisine.length >= 2 ? cuisine : null,
    accepting: one(params, "accepting") === "1",
    maxBudget: positiveInt(one(params, "maxBudget")?.replace(/[$,]/g, ""), 1_000_000),
    guests: positiveInt(one(params, "guests"), 5000),
  };
}

export type ChefMatchable = ChefPrices & {
  citySlug: string | null;
  areaSlugs: string[];
  services: string[];
  specialties: string[];
  accepting: boolean;
  minGuests: number | null;
  maxGuests: number | null;
};

/**
 * Fits the budget if a known "from" price does: the starting price, or the per-person price
 * (times the guest count when one is given). Chefs with no listed price don't match a budget filter.
 */
export function withinBudget(p: ChefPrices, maxBudgetDollars: number, guests: number | null): boolean {
  const cap = maxBudgetDollars * 100;
  if (p.startingCents != null && p.startingCents <= cap) return true;
  if (p.perPersonCents != null && p.perPersonCents * (guests ?? 1) <= cap) return true;
  return false;
}

export function matchesFilters(c: ChefMatchable, f: ChefFilters): boolean {
  if (f.city && c.citySlug !== f.city && !c.areaSlugs.includes(f.city)) return false;
  if (f.service && !c.services.includes(f.service)) return false;
  if (f.cuisine) {
    const q = f.cuisine.toLowerCase();
    if (!c.specialties.some((s) => s.toLowerCase().includes(q))) return false;
  }
  if (f.accepting && !c.accepting) return false;
  if (f.guests != null) {
    if (c.minGuests != null && f.guests < c.minGuests) return false;
    if (c.maxGuests != null && f.guests > c.maxGuests) return false;
  }
  if (f.maxBudget != null && !withinBudget(c, f.maxBudget, f.guests)) return false;
  return true;
}

// ── Notices shown after a form posts (codes only, never free text from the URL) ──
export const CHEF_NOTICES = {
  created: { ok: true, text: "Your Chef Profile is live. Add your services and specialties next." },
  saved: { ok: true, text: "Saved." },
  reviewed: { ok: true, text: "Thanks for your review." },
  reported: { ok: true, text: "Thanks. The VYBR8 Team will take a look." },
  requested: { ok: true, text: "Request sent. The VYBR8 Team will be in touch." },
  invalid: { ok: false, text: "Some fields need another look. Check them and try again." },
  taken: { ok: false, text: "You already have a Chef Profile." },
  no_business: { ok: false, text: "We couldn't find that place. Check the link name (slug) and try again." },
  confirmed_locked: { ok: false, text: "That workplace was confirmed by the business or the VYBR8 Team, so they update it." },
  duplicate_review: { ok: false, text: "You already reviewed this chef for that date." },
  own_profile: { ok: false, text: "You can't review your own Chef Profile." },
  failed: { ok: false, text: "That didn't go through. Try again." },
} as const;
export type ChefNotice = keyof typeof CHEF_NOTICES;

export function readNotice(v: unknown): (typeof CHEF_NOTICES)[ChefNotice] | null {
  return typeof v === "string" && Object.hasOwn(CHEF_NOTICES, v) ? CHEF_NOTICES[v as ChefNotice] : null;
}
