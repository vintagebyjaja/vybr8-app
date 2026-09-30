import "server-only";
import type { Bounds } from "@/domain/map/map";
import { overpassQuery, toImportRow, type ImportRow, type OsmElement } from "@/domain/places/osm";
import { log } from "@/server/log";

// Public Overpass servers (OpenStreetMap). Tried in order; each import request is small.
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

export class OverpassBusyError extends Error {}

/** Food & drink places in one box, cleaned into import rows (deduped by OSM id). */
export async function fetchOsmPlaces(tile: Bounds): Promise<ImportRow[]> {
  const body = new URLSearchParams({ data: overpassQuery(tile) });
  let lastStatus = 0;
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "VYBR8/1.0 (https://vybr8.live; support@vybr8.live)" },
        signal: AbortSignal.timeout(12_000),   // two tries stay under the server's time limit
        cache: "no-store",
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OsmElement[] };
      const seen = new Set<string>();
      const rows: ImportRow[] = [];
      for (const e of json.elements ?? []) {
        const r = toImportRow(e);
        if (r && !seen.has(r.ext)) { seen.add(r.ext); rows.push(r); }
      }
      return rows;
    } catch (e) {
      log.warn("osm.fetch_failed", { url, message: e instanceof Error ? e.name : "unknown" });
    }
  }
  throw new OverpassBusyError(`OpenStreetMap is busy (${lastStatus || "no answer"})`);
}
