/** Owner & cause badges. Shown only after the VYBR8 Team verifies them. Pure data. */
export const PLACE_BADGES = [
  { key: "black_owned", label: "Black-owned", tone: "bg-orange/15 text-orange border-orange/40" },
  { key: "woman_owned", label: "Woman-owned", tone: "bg-coral/15 text-coral border-coral/40" },
  { key: "latino_owned", label: "Latino-owned", tone: "bg-mint/15 text-mint border-mint/40" },
  { key: "asian_owned", label: "Asian-owned", tone: "bg-sky/15 text-sky border-sky/40" },
  { key: "veteran_owned", label: "Veteran-owned", tone: "bg-sky/15 text-sky border-sky/40" },
  { key: "lgbtq_owned", label: "LGBTQ+-owned", tone: "bg-lavender/15 text-lavender border-lavender/40" },
  { key: "good_cause", label: "Gives back", tone: "bg-mint/15 text-mint border-mint/40" },
] as const;
export type PlaceBadge = (typeof PLACE_BADGES)[number]["key"];
export const badgeInfo = (k: string) => PLACE_BADGES.find((b) => b.key === k);
export const isPlaceBadge = (k: string | null | undefined): k is PlaceBadge => !!k && PLACE_BADGES.some((b) => b.key === k);
