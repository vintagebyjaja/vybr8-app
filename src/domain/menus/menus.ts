/** A menu item as the app shows it (scores come from item ratings). */
export type MenuItemView = {
  id: string; name: string; description: string | null; category: "food" | "drink"; section: string | null; dishType: string | null;
  priceCents: number | null; isAlcoholic: boolean; soldOut: boolean; avgScore: number | null; ratingCount: number; myScore: number | null;
  /** Your ratings of this item: how many visits, your average, and whether you already rated it today. */
  myCount: number; myAvg: number | null; myRatedToday: boolean;
  /** Where it came from: the owner, the Team, a chain's shared menu, or an imported restaurant menu. */
  source: "owner" | "team" | "brand" | "import"; lastVerified: string | null; priceIsLocal: boolean;
  chefs: { slug: string; name: string; type: string }[];
};

/** The note above a menu that the owner didn't write (chain menus, imported menus, Team-added menus). */
export function menuNotice(items: Pick<MenuItemView, "source" | "lastVerified">[], o: { claimed: boolean; brandName: string | null }): { title: string; body: string } | null {
  if (!items.length) return null;
  const brand = items.filter((i) => i.source === "brand").length;
  const imported = items.filter((i) => i.source === "import");
  if (brand > items.length / 2) {
    const who = o.brandName ?? "this chain";
    return { title: `${who} menu`, body: `The same menu across ${who} locations. Items can vary by location, and prices aren't shown here.` };
  }
  if (imported.length > items.length / 2) {
    const d = imported.map((i) => i.lastVerified).filter((x): x is string => !!x).sort()[0];
    const when = d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
    return { title: "From their menu", body: `${when ? `Prices from their menu as of ${when}.` : "Prices from their menu."} Prices can change.` };
  }
  if (!o.claimed) return { title: "Part of the menu.", body: "Added by the VYBR8 Team. Prices can change." };
  return null;
}

/** Format cents as $7 or $7.50. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}
