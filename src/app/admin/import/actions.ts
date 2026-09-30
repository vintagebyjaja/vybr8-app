"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CITIES, findCity } from "@/domain/map/map";
import { TILE_GRID, tiles } from "@/domain/places/osm";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { log } from "@/server/log";
import { fetchOsmPlaces, OverpassBusyError } from "@/server/osm";

export type TileResult = { found: number; added: number; matched: number; known: number; skipped: number; errors: string[]; busy?: boolean };

/** Import one tile of a city (the page walks through all 25). Admin only, checked here and in the database. */
export async function importTile(citySlug: string, tile: number): Promise<TileResult> {
  const admin = await requireAdmin();
  const p = z.object({ city: z.enum(CITIES.map((c) => c.slug) as [string, ...string[]]), tile: z.number().int().min(0).max(TILE_GRID * TILE_GRID - 1) })
    .safeParse({ city: citySlug, tile });
  if (!p.success) return { found: 0, added: 0, matched: 0, known: 0, skipped: 0, errors: ["Bad request"] };
  const city = findCity(p.data.city);
  const box = tiles(city.bounds, TILE_GRID)[p.data.tile]!;

  let rows;
  try {
    rows = await fetchOsmPlaces(box);
  } catch (e) {
    if (e instanceof OverpassBusyError) return { found: 0, added: 0, matched: 0, known: 0, skipped: 0, errors: [e.message], busy: true };
    throw e;
  }

  const supabase = await createClient();
  const total: TileResult = { found: rows.length, added: 0, matched: 0, known: 0, skipped: 0, errors: [] };
  for (let i = 0; i < rows.length; i += 400) {
    const { data, error } = await supabase.rpc("import_places", { p_city: city.slug, p_rows: rows.slice(i, i + 400) });
    if (error) {
      log.warn("osm.import_failed", { adminId: admin.id, city: city.slug, tile, code: error.code });
      total.errors.push(error.message);
      continue;
    }
    const d = data as { added: number; matched: number; known: number; skipped: number; errors?: string[] };
    total.added += d.added; total.matched += d.matched; total.known += d.known; total.skipped += d.skipped;
    total.errors.push(...(d.errors ?? []));
  }
  if (total.added) revalidatePath("/", "layout");
  return total;
}
