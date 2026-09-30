/**
 * CraveZone: pure logic (no network), so it can be unit-tested.
 * The craving taxonomy itself comes from the database (craving_categories); these helpers only work with it.
 */

export type CravingCategory = {
  slug: string; name: string; emoji: string; tone: string;
  indulgent: boolean; light: boolean;
  itemKeywords: string[]; searchTerms: string[];
};

export type ParsedCraving = {
  include: string[];      // category slugs
  exclude: string[];      // "not spicy", "no chocolate"
  light: boolean;         // "not too heavy", "something light"
  big: boolean;           // "big back", "loaded"
  maxPriceCents: number | null;
  freeText: string | null; // leftover words to search item names ("birria")
};

const NEGATORS = /\b(no|not|without|nothing|zero|skip|hold the|minus)\s+(?:too\s+|really\s+|very\s+|so\s+)?$/;
const LIGHT = /\b(not (?:too |that |so )?heavy|light(?:er)?|not greasy|nothing heavy|healthy|healthier|clean)\b/;
const BIG = /\b(big back|loaded|huge|massive|go crazy|treat myself|indulge|indulgent|extra)\b/;
const PRICE = /\b(?:under|less than|below|max|no more than)\s*\$?\s*(\d{1,3})\b/;
const FILLER = new Set([
  "i", "im", "i'm", "want", "wanna", "need", "craving", "crave", "something", "some", "a", "an", "the", "and", "or", "but", "with",
  "me", "my", "for", "to", "of", "in", "like", "kinda", "kind", "sort", "really", "so", "very", "too", "that", "is", "it", "get",
  "give", "have", "got", "just", "right", "now", "tonight", "today", "please", "food", "eat", "snack", "treat", "anything", "thing",
  "not", "no", "without", "heavy", "light", "lighter", "under", "less", "than", "below", "max", "more", "big", "back", "loaded", "extra",
  "bit", "little", "lil", "on", "hit", "spot", "would", "could", "maybe", "feel", "feeling", "vibe", "vybe", "mood",
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, "u");

/** "Something fruity and cold but not spicy, under $10" → { include: [fruity, cold_refreshing], exclude: [spicy], maxPriceCents: 1000 } */
export function parseCraving(input: string, categories: CravingCategory[]): ParsedCraving {
  const text = ` ${input.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim()} `;
  const include = new Set<string>();
  const exclude = new Set<string>();
  const used: [number, number][] = [];

  for (const c of categories) {
    const terms = [c.name, c.slug.replace(/_/g, " "), ...c.searchTerms, ...c.itemKeywords]
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length >= 3)
      .sort((a, b) => b.length - a.length);
    for (const t of terms) {
      const m = wordRe(t).exec(text);
      if (!m) continue;
      const start = m.index + m[1]!.length;
      const negated = NEGATORS.test(text.slice(Math.max(0, start - 24), start));
      (negated ? exclude : include).add(c.slug);
      used.push([start, start + t.length]);
      break;
    }
  }
  for (const s of exclude) include.delete(s);

  const price = PRICE.exec(text);
  let rest = text;
  for (const [a, b] of [...used].sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + " " + rest.slice(b);
  const leftover = rest
    .replace(PRICE, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w));

  return {
    include: [...include],
    exclude: [...exclude],
    light: LIGHT.test(text),
    big: BIG.test(text),
    maxPriceCents: price ? Number(price[1]) * 100 : null,
    freeText: include.size === 0 && leftover.length ? leftover.join(" ").slice(0, 60) : null,
  };
}

export type CraveFeatures = {
  wanted: number;              // how many cravings were picked
  matchWeight: number;         // sum of tag confidences for picked cravings
  matchedCount: number;        // how many picked cravings the item hits
  avgScore: number | null;     // VYBR8 score (0-10)
  ratingCount: number;
  meters: number | null;
  tasteHits?: number;          // item mentions things the person loves
  tasteMisses?: number;        // …or things they avoid
  light?: boolean; indulgent?: boolean;
  wantLight?: boolean; wantBig?: boolean;
};

/**
 * "% VYBE": how well an item fits THIS craving for THIS person. Not a quality score (that's the VYBR8 score).
 * Craving fit dominates; ratings, taste and distance fine-tune. Clamped to 1–99 so nothing claims to be perfect.
 */
export function vybePercent(f: CraveFeatures): number {
  const coverage = f.wanted > 0 ? Math.min(1, f.matchedCount / f.wanted) : 0.6;
  const confidence = f.matchedCount > 0 ? Math.min(1, f.matchWeight / f.matchedCount) : 0.6;
  const trust = f.avgScore != null ? Math.min(1, f.ratingCount / 5) : 0;
  const quality = f.avgScore != null ? (f.avgScore / 10) * trust + 0.6 * (1 - trust) : 0.6;
  const km = f.meters != null ? f.meters / 1000 : 5;
  const near = Math.max(0, 1 - km / 25);
  let p = 100 * (0.5 * coverage + 0.15 * confidence + 0.25 * quality + 0.1 * near);
  p += 4 * (f.tasteHits ?? 0) - 12 * (f.tasteMisses ?? 0);
  if (f.wantLight) p += f.light ? 5 : f.indulgent ? -6 : 0;
  if (f.wantBig) p += f.indulgent ? 6 : 0;
  return Math.max(1, Math.min(99, Math.round(p)));
}

export const CRAVE_SORTS = [
  { key: "match", label: "Best match" },
  { key: "top", label: "Highest rated" },
  { key: "near", label: "Closest" },
  { key: "price", label: "Lowest price" },
] as const;
export type CraveSort = (typeof CRAVE_SORTS)[number]["key"];

/** Filters that go in the URL. Everything here is non-sensitive and shareable. */
export const CRAVE_FILTERS = [
  { key: "open", label: "Open now" },
  { key: "u10", label: "Under $10" },
  { key: "u20", label: "Under $20" },
  { key: "local", label: "Local" },
  { key: "black_owned", label: "Black-owned" },
  { key: "trucks", label: "Food trucks" },
  { key: "dinein", label: "Dine in" },
  { key: "healthyish", label: "Healthy-ish" },
  { key: "bigback", label: "Big Back Mode 😈" },
  { key: "saved", label: "My saves" },
] as const;
export type CraveFilter = (typeof CRAVE_FILTERS)[number]["key"];
export const isCraveFilter = (k: string): k is CraveFilter => CRAVE_FILTERS.some((f) => f.key === k);

/** "sweet,cold_refreshing" → valid slugs only, max 4, no repeats. */
export function parseSlugs(raw: string | null | undefined, known: Set<string>): string[] {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => known.has(s)))].slice(0, 4);
}

export function formatCents(c: number | null | undefined): string | null {
  if (c == null) return null;
  return c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`;
}

/** Friendly heading: SWEET + CHOCOLATE 🍫 */
export function cravingHeadline(slugs: string[], categories: CravingCategory[]): string {
  const picked = slugs.map((s) => categories.find((c) => c.slug === s)).filter(Boolean) as CravingCategory[];
  if (!picked.length) return "";
  return `${picked.map((c) => c.name.toUpperCase()).join(" + ")} ${picked[picked.length - 1]!.emoji}`;
}
