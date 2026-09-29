/** VYBR8 Charts: shared names and sizes (pure, used by server and pages). */

export const CHART_SIZE = 25;

export type ChartEntry = { rank: number; id: string; name: string; sub: string; href: string; score: number; count: number };
export type Chart = { key: string; title: string; entries: ChartEntry[]; total: number; seeAll: string | null };
/** "#3 Wings in Charlotte". */
export type RankBadge = { rank: number; label: string; href: string };

export type ChartKind = "plates" | "pours" | "places" | "trucks" | "chefs";
export const CHART_KINDS: ChartKind[] = ["plates", "pours", "places", "trucks", "chefs"];

export const CHART_TABS = [
  { key: "top", label: "VYBR8 25" },
  { key: "food", label: "FOOD" },
  { key: "drinks", label: "DRINKS" },
  { key: "places", label: "PLACES" },
  { key: "chefs", label: "CHEFS" },
  { key: "trucks", label: "FOOD TRUCKS" },
] as const;
export type ChartTab = (typeof CHART_TABS)[number]["key"];

export function parseTab(v: string | undefined): ChartTab {
  return CHART_TABS.some((t) => t.key === v) ? (v as ChartTab) : "top";
}

export function parseKind(v: string | undefined): ChartKind | null {
  return CHART_KINDS.includes(v as ChartKind) ? (v as ChartKind) : null;
}

/** "chicken-wings" → "Chicken Wings", "mac-and-cheese" → "Mac & Cheese". */
export function dishTypeTitle(dishType: string): string {
  return dishType
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w === "and" ? "&" : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** "Top 25 Wings", "Top 5 Tacos". */
export function chartHeading(title: string, size: number): string {
  return `Top ${size} ${title}`;
}
