import Link from "next/link";
import { chefCharts, itemCharts, placeCharts, CHART_THRESHOLDS, MIN_CHEF_REVIEWS_FOR_CHARTS, type Chart } from "@/server/charts";

export const metadata = { title: "VYBR8 Charts" };

const TABS = [
  { key: "food", label: "FOOD" },
  { key: "drinks", label: "DRINKS" },
  { key: "places", label: "PLACES" },
  { key: "chefs", label: "CHEFS" },
  { key: "trucks", label: "FOOD TRUCKS" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function ChartsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: t } = await searchParams;
  const tab: Tab = TABS.some((x) => x.key === t) ? (t as Tab) : "food";
  const charts: Chart[] =
    tab === "food" ? await itemCharts("food")
    : tab === "drinks" ? await itemCharts("drink")
    : tab === "places" ? await placeCharts(false)
    : tab === "chefs" ? await chefCharts()
    : [...(await placeCharts(true)), ...(await itemCharts("food", true)), ...(await itemCharts("drink", true))];
  const any = charts.some((c) => c.entries.length);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-extrabold">VYBR8 <span className="vybe-text">Charts</span></h1>
        <p className="mt-1 text-muted">What&rsquo;s actually good, ranked by the people who ate and drank it.</p>
      </header>
      <nav aria-label="Charts" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((x) => (
          <Link key={x.key} href={`/charts?tab=${x.key}`} aria-current={tab === x.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold tracking-wide ${tab === x.key ? "vybe-gradient text-ink" : "border border-line text-muted hover:text-text"}`}>{x.label}</Link>
        ))}
      </nav>

      {!any && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          {tab === "chefs"
            ? `Chef charts appear once verified chefs have at least ${MIN_CHEF_REVIEWS_FOR_CHARTS} service reviews.`
            : `Nothing ranked yet. A dish needs at least ${CHART_THRESHOLDS.minRatings} ratings to chart. Go rate what you ate!`}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {charts.filter((c) => c.entries.length).map((c) => (
          <section key={`${c.key}-${c.title}`} aria-label={c.title} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-extrabold">{c.title.startsWith("#") ? c.title : `Top ${c.title}`}</h2>
            <ol className="flex flex-col divide-y divide-line">
              {c.entries.map((e) => (
                <li key={e.id}>
                  <Link href={e.href} className="flex items-center gap-3 py-2.5 hover:opacity-90">
                    <span className={`w-9 font-display text-lg font-extrabold ${e.rank === 1 ? "vybe-text" : "text-faint"}`}>#{e.rank}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{e.name}</span>{e.sub && <span className="block truncate text-xs text-muted">{e.sub}</span>}</span>
                    <span className="text-right"><b className="font-display">{e.score.toFixed(1)}</b><span className="block text-[11px] text-faint">{e.count} ratings</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <ul className="flex flex-col gap-1 text-xs text-faint">
        <li>Ranked on confidence, not raw averages: one perfect rating never beats a crowd of great ones. Recent ratings count more.</li>
        <li>Payment never changes a VYBR8 score or organic chart rank. Paid placements are always labeled Promoted or Sponsored.</li>
      </ul>
    </div>
  );
}
