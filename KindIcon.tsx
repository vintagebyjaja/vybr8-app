/** A small line icon for each kind of place (used on map pins and place lists). */
const PATHS: Record<string, string> = {
  // fork & knife
  restaurant: "M7 3v8a2 2 0 0 0 2 2v8M5 3v5a2 2 0 0 0 4 0V3M17 21V3c-2 1-3 4-3 7v3h3",
  // coffee cup
  cafe: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3",
  // tea cup with leaf
  tea_shop: "M4 10h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4zM16 12h1.5a2 2 0 0 1 0 4H16M14 3c-3 0-5 2-5 5 3 0 5-2 5-5z",
  // cup with straw
  juice_bar: "M6 8h12l-1.5 13h-9L6 8zM12 8l3-5h3M6.5 12h11",
  // cupcake
  bakery: "M6 12h12l-1.5 8h-9L6 12zM5 12a7 5 0 0 1 14 0M12 4v3",
  // cocktail glass
  bar: "M4 4h16l-8 9-8-9zM12 13v7M8 20h8M15 4l2-2",
  // beer mug
  brewery: "M5 7h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7zM15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 7a3 3 0 0 1 5-2 3 3 0 0 1 5 2M8 11v6M12 11v6",
  // music note
  nightlife: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  // armchair (lounges)
  lounge: "M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3v-5zM5 17v3M19 17v3",
  // truck
  food_truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
};
const ALIAS: Record<string, string> = { cocktail_lounge: "bar", hookah_lounge: "lounge", cigar_lounge: "lounge" };

/** Pin colors by kind: food warm, coffee/tea cool, drinks coral, nights lavender. */
export const KIND_TONE: Record<string, string> = {
  restaurant: "bg-orange text-ink", food_truck: "bg-orange text-ink", bakery: "bg-orange text-ink",
  cafe: "bg-sky text-ink", tea_shop: "bg-mint text-ink", juice_bar: "bg-mint text-ink",
  bar: "bg-coral text-ink", cocktail_lounge: "bg-coral text-ink", brewery: "bg-coral text-ink",
  lounge: "bg-lavender text-ink", hookah_lounge: "bg-lavender text-ink", cigar_lounge: "bg-lavender text-ink", nightlife: "bg-lavender text-ink",
};

export function KindIcon({ kind, className = "size-4" }: { kind: string; className?: string }) {
  const d = PATHS[kind] ?? PATHS[ALIAS[kind] ?? ""] ?? PATHS.restaurant!;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
