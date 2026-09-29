import Link from "next/link";
import { RateItem } from "@/components/ratings/RateItem";
import type { MenuItemView } from "@/domain/menus/menus";
import { RankBadge } from "@/components/charts/RankBadge";
import type { RankBadge as Badge } from "@/domain/charts/charts";

/** A menu with VYBR8 scores per item, sold-out state, chef credits and a Deep Dive link. */
export function MenuList({ items, signedIn, returnTo, ranks = {} }: { items: MenuItemView[]; signedIn: boolean; returnTo: string; ranks?: Record<string, Badge> }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No menu on VYBR8 yet.</p>;
  const sections = [...new Set(items.map((i) => i.section ?? (i.category === "drink" ? "Drinks" : "Menu")))];
  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => (
        <section key={s} aria-label={s} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-faint">{s}</h3>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {items.filter((i) => (i.section ?? (i.category === "drink" ? "Drinks" : "Menu")) === s).map((i) => (
              <li key={i.id} className={`flex flex-col gap-2 p-4 ${i.soldOut ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {i.name}
                      {i.isAlcoholic && <span className="ml-2 rounded-full border border-line px-1.5 text-[10px] font-bold text-muted">21+</span>}
                      {i.soldOut && <span className="ml-2 rounded-full bg-surface-2 px-2 text-[11px] font-bold text-coral">Sold out</span>}
                    </p>
                    {ranks[i.id] && <p className="mt-0.5"><RankBadge badge={ranks[i.id]!} small /></p>}
                    {i.description && <p className="text-sm text-muted">{i.description}</p>}
                    {i.chefs.length > 0 && (
                      <p className="text-xs text-faint">
                        By {i.chefs.map((c, n) => <span key={c.slug}>{n > 0 && ", "}<Link href={`/chef/${c.slug}`} className="text-sky hover:underline">{c.name}</Link></span>)}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {i.avgScore != null ? (
                      <p className="font-display text-xl font-extrabold"><span className="vybe-text">{i.avgScore.toFixed(1)}</span></p>
                    ) : (
                      <p className="text-xs text-faint">No ratings yet</p>
                    )}
                    <p className="text-xs text-faint">{i.ratingCount > 0 ? `${i.ratingCount} ${i.ratingCount === 1 ? "rating" : "ratings"}` : ""}{i.priceCents != null ? `${i.ratingCount > 0 ? " · " : ""}$${(i.priceCents / 100).toFixed(2).replace(/\.00$/, "")}` : ""}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {signedIn ? <RateItem itemId={i.id} itemName={i.name} myScore={i.myScore} returnTo={returnTo} /> : <Link href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`} className="text-xs font-semibold text-sky">Sign in to rate</Link>}
                  <Link href={`/max/deep-dive/${i.id}`} className="min-h-9 rounded-full px-3 py-2 text-xs font-bold text-coral hover:bg-surface-2">DEEP DIVE →</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
