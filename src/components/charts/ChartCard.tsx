import Link from "next/link";
import { chartHeading, type Chart } from "@/domain/charts/charts";

/** One ranked list. `big` is the full-width VYBR8 25 / Top 25 look. */
export function ChartCard({ chart, size, big = false, empty }: { chart: Chart; size: number; big?: boolean; empty?: string }) {
  return (
    <section aria-label={chart.title} className={`flex flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-5 ${big ? "border-coral/40" : "border-line"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`font-display font-extrabold ${big ? "text-2xl" : "text-lg"}`}>{chartHeading(chart.title, size)}</h2>
        {chart.seeAll && chart.total > chart.entries.length && (
          <Link href={chart.seeAll} className="shrink-0 text-sm font-semibold text-sky hover:underline">See all {chart.total}</Link>
        )}
      </div>
      {chart.entries.length === 0 ? (
        <p className="py-4 text-sm text-muted">{empty ?? "Nothing ranked here yet. Rate what you try to get it on the chart."}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {chart.entries.map((e) => (
            <li key={e.id}>
              <Link href={e.href} className="flex items-center gap-3 py-2.5 hover:opacity-90">
                <span className={`w-10 shrink-0 font-display font-extrabold ${big ? "text-xl" : "text-lg"} ${e.rank <= 3 ? "vybe-text" : "text-faint"}`}>#{e.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.name}</span>
                  {e.sub && <span className="block truncate text-xs text-muted">{e.sub}</span>}
                </span>
                <span className="text-right">
                  <b className="font-display">{e.score.toFixed(1)}</b>
                  <span className="block text-[11px] text-faint">{e.count} {e.count === 1 ? "rating" : "ratings"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
