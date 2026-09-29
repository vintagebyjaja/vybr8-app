import Link from "next/link";
import type { RankBadge as Badge } from "@/domain/charts/charts";

/** "#3 Wings in Charlotte": links to the chart it came from. */
export function RankBadge({ badge, small = false }: { badge: Badge; small?: boolean }) {
  return (
    <Link
      href={badge.href}
      className={`inline-flex items-center gap-1 rounded-full border border-coral/50 bg-coral/10 font-extrabold text-coral hover:bg-coral/20 ${small ? "px-2 py-0 text-[11px] leading-5" : "px-3 py-1 text-xs"}`}
    >
      <span className="vybe-text">#{badge.rank}</span> {badge.label}
    </Link>
  );
}
