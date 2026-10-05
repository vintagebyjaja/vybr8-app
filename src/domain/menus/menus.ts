/** A menu item as the app shows it (scores come from item ratings). */
export type MenuItemView = {
  id: string; name: string; description: string | null; category: "food" | "drink"; section: string | null; dishType: string | null;
  priceCents: number | null; isAlcoholic: boolean; soldOut: boolean; avgScore: number | null; ratingCount: number; myScore: number | null;
  /** Your ratings of this item: how many visits, your average, and whether you already rated it today. */
  myCount: number; myAvg: number | null; myRatedToday: boolean;
  chefs: { slug: string; name: string; type: string }[];
};

/** Format cents as $7 or $7.50. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}
