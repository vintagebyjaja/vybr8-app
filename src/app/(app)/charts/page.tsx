import Link from "next/link";
import { ChartCard } from "@/components/charts/ChartCard";
import { CityChips } from "@/components/charts/CityChips";
import { CHART_SIZE, CHART_TABS, parseTab } from "@/domain/charts/charts";
import { findCity } from "@/domain/map/map";
import { getViewer } from "@/server/auth";
import { CHART_THRESHOLDS, MIN_CHEF_REVIEWS_FOR_CHARTS, chefCharts, itemCharts, placeCharts, vybr8TwentyFive, type Chart } from "@/server/charts";
import { getViewerCity } from "@/server/map";

export const metadata = { title: "VYBR8 Charts" };

export default async function ChartsPage({ searchParams }: { searchParams: Promise<{ tab?: string; city?: string }> }) {
  const { tab: t, city: c } = await searchParams;
  const tab = parseTab(t);
  const viewer = await getViewer();
  const city = findCity(c ?? (await getViewerCity(viewer)));
  const href = (next: { tab?: string; city?: string }) =>
    `/charts?${new URLSearchParams({ tab: next.tab ?? tab, city: next.city ?? city.slug })}`;

  let charts: Chart[] = [];
  if (tab === "top") charts = await vybr8TwentyFive(city.slug);
  else if (tab === "food") charts = await itemCharts("food", city.slug);
  else if (tab === "drinks") charts = await itemCharts("drink", city.slug);
  else if (tab === "places") charts = await placeCharts(city.slug, false);
  else if (tab === "chefs") charts = await chefCharts(city.slug);
  else charts = [...(await placeCharts(city.slug, true)), ...(await itemCharts("food", city.slug, true)), ...(await itemCharts("drink", city.slug, true))];
  const withEntries = charts.filter((ch) => ch.entries.length);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-4xl font-extrabold">VYBR8 <span className="vybe-text">Charts</span></h1>
        <p className="mt-1 text-muted">What&rsquo;s actually good in {city.name}, ranked by the people who ate and drank it.</p>
      </header>

      <CityChips current={city.slug} hrefFor={(slug) => href({ city: slug })} />

      <nav aria-label="Charts" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {CHART_TABS.map((x) => (
          <Link key={x.key} href={href({ tab: x.key })} aria-current={tab === x.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold tracking-wide ${tab === x.key ? "vybe-gradient text-ink" : "border border-line text-muted hover:text-text"}`}>{x.label}</Link>
        ))}
      </nav>

      {tab === "top" ? (
        <>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">The VYBR8 25</p>
            <p className="mt-1 font-display text-2xl font-extrabold">The 25 best in {city.name} right now</p>
            <p className="mt-1 text-sm text-muted">Places, plates and pours, updated as ratings come in. Recent ratings count more, so the list stays fresh.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {charts.map((ch) => (
              <ChartCard key={ch.key + ch.title} chart={ch} size={CHART_SIZE} big
                empty={`Nothing on this chart in ${city.name} yet. Anything with ${CHART_THRESHOLDS.minRatings}+ ratings can make it.`} />
            ))}
          </div>
        </>
      ) : withEntries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          {tab === "chefs"
            ? `Chef charts in ${city.name} appear once verified chefs have at least ${MIN_CHEF_REVIEWS_FOR_CHARTS} service reviews.`
            : `Nothing ranked in ${city.name} yet. Something needs at least ${CHART_THRESHOLDS.minRatings} ratings to chart. Go rate what you ate!`}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {withEntries.map((ch) => <ChartCard key={`${ch.key}-${ch.title}`} chart={ch} size={ch.entries.length} />)}
        </div>
      )}

      <ul className="flex flex-col gap-1 text-xs text-faint">
        <li>Ranked on confidence, not raw averages: one perfect rating never beats a crowd of great ones. Recent ratings count more.</li>
        <li>Each franchise location is ranked on its own.</li>
        <li>Payment never changes a VYBR8 score or organic chart rank. Paid placements are always labeled Promoted or Sponsored.</li>
      </ul>
    </div>
  );
}
