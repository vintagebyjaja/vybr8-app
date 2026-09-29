/**
 * Unified search: people type what they want ("best wings near me", "private chef for a birthday",
 * "food trucks open tonight"). This works out which tab fits, without them knowing our data model.
 */

export type SearchTab = "all" | "food" | "drinks" | "chefs" | "trucks" | "nightlife";
export type ParsedSearch = {
  tab: SearchTab;
  terms: string[];            // words to match on names / dish types
  openNow: boolean;
  service: "private_chef" | "catering" | "meal_prep" | null;
  occasion: string | null;    // "birthday", ...
  guests: number | null;
  maxBudget: number | null;   // dollars
};

export const SEARCH_TABS: { key: SearchTab; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "food", label: "FOOD" },
  { key: "drinks", label: "DRINKS" },
  { key: "chefs", label: "CHEFS" },
  { key: "trucks", label: "FOOD TRUCKS" },
  { key: "nightlife", label: "NIGHTLIFE" },
];

const STOP = new Set(["best", "good", "great", "top", "near", "me", "nearby", "around", "for", "a", "an", "the", "that", "with", "and", "in", "at", "to", "of", "some", "spot", "spots", "place", "places", "find", "open", "tonight", "now", "today", "under", "guests", "people", "who", "does", "i", "want"]);
const DRINK_WORDS = ["cocktail", "cocktails", "martini", "margarita", "drink", "drinks", "coffee", "espresso", "matcha", "lemonade", "tea", "boba", "smoothie", "mocktail", "wine", "beer", "bar", "bourbon", "latte"];
const NIGHT_WORDS = ["hookah", "cigar", "lounge", "nightlife", "club", "rooftop", "dj"];
const CHEF_WORDS = ["chef", "chefs", "caterer", "catering", "cater", "caters", "meal prep", "mealprep", "private chef", "personal chef"];
const TRUCK_WORDS = ["food truck", "food trucks", "truck", "trucks"];

export function parseSearch(raw: string, forced?: string | null): ParsedSearch {
  const q = raw.toLowerCase().replace(/[^a-z0-9$&' ]+/g, " ").replace(/\s+/g, " ").trim();
  const has = (words: string[]) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(q));

  let tab: SearchTab = "all";
  if (has(CHEF_WORDS)) tab = "chefs";
  else if (has(TRUCK_WORDS)) tab = "trucks";
  else if (has(NIGHT_WORDS)) tab = "nightlife";
  else if (has(DRINK_WORDS)) tab = "drinks";
  else if (q) tab = "food";
  if (forced && SEARCH_TABS.some((t) => t.key === forced)) tab = forced as SearchTab;

  const service = /private chef|personal chef/.test(q) ? "private_chef" : /cater/.test(q) ? "catering" : /meal ?prep/.test(q) ? "meal_prep" : null;
  const occasion = /birthday|bday/.test(q) ? "birthday" : /wedding/.test(q) ? "wedding" : /shower/.test(q) ? "shower" : null;
  const guests = Number(/(\d{1,3}) ?(guests|people|ppl)/.exec(q)?.[1] ?? NaN);
  const budget = Number(/(under|below|less than) ?\$?(\d{2,5})/.exec(q)?.[2] ?? NaN);

  const skip = new Set([...CHEF_WORDS, ...TRUCK_WORDS, "birthday", "bday", "wedding", "shower", "caters", "cater", "catering", "private", "personal", "prep", "meal", "food"]);
  const terms = q
    .replace(/(under|below|less than) ?\$?\d+/g, " ")
    .replace(/\d+ ?(guests|people|ppl)/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w) && !skip.has(w) && !/^\$?\d+$/.test(w))
    .map((w) => (w.endsWith("s") && w.length > 4 && !w.endsWith("ss") ? w.slice(0, -1) : w));

  return {
    tab,
    terms: [...new Set(terms)].slice(0, 6),
    openNow: /open (now|tonight|today)|tonight|right now/.test(q),
    service,
    occasion,
    guests: Number.isFinite(guests) ? guests : null,
    maxBudget: Number.isFinite(budget) ? budget : null,
  };
}

export const DRINK_KINDS = ["bar", "cocktail_lounge", "cafe", "tea_shop", "juice_bar", "brewery"] as const;
export const NIGHTLIFE_KINDS = ["bar", "lounge", "hookah_lounge", "cigar_lounge", "nightlife", "cocktail_lounge"] as const;
export const FOOD_KINDS = ["restaurant", "bakery", "food_truck", "cafe"] as const;
