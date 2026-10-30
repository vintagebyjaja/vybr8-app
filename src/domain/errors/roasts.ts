/**
 * VYBR8's branded 404 roasts. All local: no API calls, no AI.
 * Food is the default; nightlife-looking dead links get the nightlife set.
 */

export type RoastKind = "food" | "nightlife";
export type Roast = { headline: string; subtitle: string };

export const ROASTS: Record<RoastKind, Roast[]> = {
  food: [
    { headline: "404: DAMN, YOU ATE THE WHOLE PAGE TOO? 😭", subtitle: "We ain't even get to save you a plate." },
    { headline: "THIS PAGE MISSING LIKE YOUR LEFTOVERS. 🍗", subtitle: "You know damn well you ate them last night." },
    { headline: "YOU FOUND THE 404 BUT COULDN'T FIND THE FOOD?", subtitle: "Crazy work. 💀" },
    { headline: "THE FOOD AIN'T HERE, GANG.", subtitle: "Take your hungry ass back home." },
  ],
  nightlife: [
    { headline: "AIN'T YOU JUST PAY RENT? 💸", subtitle: "Why you tryna go out AGAIN?" },
    { headline: "GO DRINK SOME WATER. 💧", subtitle: "Your liver already filed a complaint." },
    { headline: "YOU DON'T NEED ANOTHER SHOT. 🥃", subtitle: "You need to check your bank account." },
    { headline: "404: YOUR TAB DECLINED. 💳", subtitle: "Even this page don't wanna go out with you." },
    { headline: "YOU SAID YOU WAS STAYING IN. 🤨", subtitle: "That was literally 20 minutes ago." },
    { headline: "THE CLUB AIN'T GOING NOWHERE.", subtitle: "But your rent money definitely is." },
  ],
};

/** Where each "take me back" button goes: real VYBR8 discovery pages. */
export const ROAST_HOME: Record<RoastKind, { href: string; label: string }> = {
  food: { href: "/eat", label: "Take My Hungry Ass Back 🍔" },
  nightlife: { href: "/search?tab=nightlife", label: "Take My Broke Ass Home 🍸" },
};

export const ROAST_EMOJIS: Record<RoastKind, string[]> = {
  food: ["🍔", "🍗", "🌮", "🍕", "🍟"],
  nightlife: ["🍸", "🥃", "💸", "💧", "🍾"],
};

// Only reached for URLs that don't exist, so a word here can never steal a real page.
const NIGHTLIFE_WORDS = new Set([
  "nightlife", "bar", "bars", "club", "clubs", "lounge", "lounges", "cocktail", "cocktails", "drink", "drinks", "pour", "pours",
  "brewery", "breweries", "beer", "wine", "hookah", "happy-hour", "happyhour", "party", "rooftop", "shots", "tab",
]);

/** Classify a dead URL by its first path segment (and nightlife search links). Unknown → food. */
export function roastKindFor(pathname: string | null | undefined, search = ""): RoastKind {
  if (/(^|[?&])tab=nightlife(&|$)/.test(search)) return "nightlife";
  const first = (pathname ?? "/").toLowerCase().split("/").filter(Boolean)[0] ?? "";
  return NIGHTLIFE_WORDS.has(first) ? "nightlife" : "food";
}

/** Another roast from the same set, never the one showing now. `rand` is injectable for tests. */
export function nextRoast(kind: RoastKind, current: number | null, rand: () => number = Math.random): number {
  const n = ROASTS[kind].length;
  if (n <= 1) return 0;
  if (current == null || current < 0 || current >= n) return Math.floor(rand() * n);
  return (current + 1 + Math.floor(rand() * (n - 1))) % n;
}
