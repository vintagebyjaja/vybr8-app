import Link from "next/link";
import { notFound } from "next/navigation";
import { CITIES } from "@/domain/map/map";
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL, TILE_GRID } from "@/domain/places/osm";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireAdmin } from "@/server/auth";
import { ImportRunner } from "./ImportRunner";

export const metadata = { title: "Import real places" };

export default async function ImportPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("city_place_counts");
  const counts = new Map(((data ?? []) as { city_slug: string; places: number; imported: number }[]).map((r) => [r.city_slug, r]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted hover:text-text">← Admin</Link>
      <header>
        <h1 className="text-3xl font-bold">Import real places</h1>
        <p className="text-sm text-muted">
          Pulls real restaurants, fast food, cafes, tea and juice spots, bakeries and dessert shops, bars, lounges, breweries and clubs for a city from OpenStreetMap.
          Places already on VYBR8 are matched, never duplicated, and you can run a city again any time to pick up new spots.
          Imported places are live right away and get the VYBR8 Approved badge only when the owner claims them.
        </p>
      </header>

      <ImportRunner cities={CITIES.map((c) => ({ slug: c.slug, name: c.name, imported: Number(counts.get(c.slug)?.imported ?? 0) }))} tileCount={TILE_GRID * TILE_GRID} />

      <section aria-labelledby="counts-h" className="flex flex-col gap-2">
        <h2 id="counts-h" className="text-lg font-bold">Places per city</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CITIES.map((c) => {
            const n = counts.get(c.slug);
            return (
              <li key={c.slug} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-muted tabular-nums">{(n?.places ?? 0).toLocaleString()} places · {(n?.imported ?? 0).toLocaleString()} imported</span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-faint">
        Place data {OSM_ATTRIBUTION}, under the <a href={OSM_COPYRIGHT_URL} className="underline">Open Database License</a>. VYBR8 credits OpenStreetMap on every imported place.
      </p>
    </main>
  );
}
