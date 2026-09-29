import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartCard } from "@/components/charts/ChartCard";
import { CityChips } from "@/components/charts/CityChips";
import { CHART_SIZE, chartHeading, parseKind } from "@/domain/charts/charts";
import { findCity } from "@/domain/map/map";
import { getViewer } from "@/server/auth";
import { CHEF_SERVICES_CHARTED, PLACE_DIMS, chefChart, itemChart, placeChart, type Chart } from "@/server/charts";
import { getViewerCity } from "@/server/map";

type Props = { params: Promise<{ kind: string; key: string }>; searchParams: Promise<{ city?: string }> };

async function load(kindRaw: string, key: string, city: string): Promise<Chart | null> {
  const kind = parseKind(kindRaw);
  if (!kind || !/^[a-z0-9_-]{1,60}$/.test(key)) return null;
  if (kind === "plates") return itemChart("food", city, key);
  if (kind === "pours") return itemChart("drink", city, key);
  if (kind === "places" || kind === "trucks") {
    const dim = PLACE_DIMS[kind].find(([d]) => d === key)?.[0];
    return dim ? placeChart(city, kind === "trucks", dim) : null;
  }
  return CHEF_SERVICES_CHARTED.some(([s]) => s === key) ? chefChart(city, key) : null;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { kind, key } = await params;
  const city = findCity((await searchParams).city);
  const chart = await load(kind, key, city.slug);
  return { title: chart ? `${chartHeading(chart.title, CHART_SIZE)} in ${city.name}` : "VYBR8 Charts" };
}

export default async function FullChartPage({ params, searchParams }: Props) {
  const { kind, key } = await params;
  const { city: c } = await searchParams;
  const city = findCity(c ?? (await getViewerCity(await getViewer())));
  const chart = await load(kind, key, city.slug);
  if (!chart) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/charts?city=${city.slug}`} className="text-sm text-muted hover:text-text">← All charts in {city.name}</Link>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">VYBR8 Charts</p>
        <h1 className="text-4xl font-extrabold">{chartHeading(chart.title, CHART_SIZE)} <span className="vybe-text">in {city.name}</span></h1>
      </header>
      <CityChips current={city.slug} hrefFor={(slug) => `/charts/${kind}/${key}?city=${slug}`} />
      <ChartCard chart={chart} size={CHART_SIZE} big empty={`Nothing ranked in ${city.name} yet. Rate what you try to get it on this chart.`} />
      <p className="text-xs text-faint">Ranked on confidence, not raw averages. Payment never changes a VYBR8 rank.</p>
    </div>
  );
}
