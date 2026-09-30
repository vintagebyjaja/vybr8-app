/** "What Should I Eat?": the filters and labels for the list of places near you. Pure data and helpers. */

export const EAT_TYPES = [
  { key: "all", label: "Everything", kinds: null },
  { key: "food", label: "Food", kinds: ["restaurant", "food_truck"] },
  { key: "coffee", label: "Coffee & tea", kinds: ["cafe", "tea_shop", "juice_bar"] },
  { key: "sweets", label: "Desserts", kinds: ["bakery"] },
  { key: "drinks", label: "Drinks", kinds: ["bar", "cocktail_lounge", "brewery", "lounge", "hookah_lounge", "cigar_lounge"] },
  { key: "night", label: "Nightlife", kinds: ["nightlife", "lounge", "hookah_lounge"] },
] as const;
export type EatType = (typeof EAT_TYPES)[number]["key"];

export const EAT_SORTS = [
  { key: "near", label: "Closest" },
  { key: "for_you", label: "For you" },
  { key: "top", label: "Top rated on VYBR8" },
] as const;
export type EatSort = (typeof EAT_SORTS)[number]["key"];

export const KIND_LABEL: Record<string, string> = {
  restaurant: "Restaurant", food_truck: "Food truck", cafe: "Coffee", tea_shop: "Tea & matcha", juice_bar: "Juice & smoothies",
  bakery: "Bakery & desserts", bar: "Bar", cocktail_lounge: "Cocktail lounge", brewery: "Brewery", lounge: "Lounge",
  hookah_lounge: "Hookah lounge", cigar_lounge: "Cigar lounge", nightlife: "Nightlife",
};

/** "soul_food" → "Soul food", "coffee_shop" → "Coffee shop". */
export function cuisineLabel(c: string): string {
  const s = c.replace(/_/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Meters → "0.3 mi", "4.2 mi", "12 mi". */
export function formatDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  const mi = meters / 1609.344;
  if (mi < 0.1) return "Right here";
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

/** Location is rounded to about 100 m before it goes in a link: close enough to sort by, not a precise pin. */
export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;
