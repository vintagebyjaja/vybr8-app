import Link from "next/link";
import { notFound } from "next/navigation";
import { findCity } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireAdmin } from "@/server/auth";

export const metadata = { title: "Menus · Admin" };

type Coverage = { city_slug: string; places: number; with_menu: number; with_brand_menu: number; with_own_menu: number; with_menu_link: number };
type BrandRow = { id: string; name: string; menu_url: string | null; menu_verified: string | null; items: { count: number }[]; places: { count: number }[] };
type SourceRow = { url: string; status: string; items: number; last_checked: string | null; business: { name: string; slug: string } | null };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Menu coverage: which places have a menu (a chain's shared menu or their own), by city; chain menus; imported sources. */
export default async function AdminMenusPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }
  const supabase = await createClient();
  const [{ data: cov }, { data: brands }, { data: sources }] = await Promise.all([
    supabase.rpc("admin_menu_coverage"),
    supabase.from("brands").select("id, name, menu_url, menu_verified, items:brand_menu_items(count), places:businesses(count)").not("menu_verified", "is", null).order("name"),
    supabase.from("menu_sources").select("url, status, items, last_checked, business:businesses ( name, slug )").not("business_id", "is", null).order("last_checked", { ascending: false }).limit(50),
  ]);
  const rows = (cov ?? []) as Coverage[];
  const total = rows.reduce((a, r) => ({ places: a.places + r.places, menu: a.menu + r.with_menu, brand: a.brand + r.with_brand_menu, own: a.own + r.with_own_menu }), { places: 0, menu: 0, brand: 0, own: 0 });
  const cityName = (slug: string) => (slug === "unknown" ? "No city" : findCity(slug).name);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <Link href="/admin" className="text-sm text-muted hover:text-text">← Admin</Link>
      <header>
        <h1 className="font-display text-3xl font-extrabold">Menus</h1>
        <p className="text-sm text-muted">
          {total.menu.toLocaleString()} of {total.places.toLocaleString()} places have a menu ({pct(total.menu, total.places)}):
          {" "}{total.brand.toLocaleString()} from a chain&rsquo;s shared menu, {total.own.toLocaleString()} with their own.
          Load or refresh menus with the numbered menu files in the Supabase SQL Editor; running one again updates in place.
        </p>
      </header>

      <section aria-labelledby="cov-h" className="flex flex-col gap-2">
        <h2 id="cov-h" className="font-bold">By city</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wider text-faint">
              <tr><th className="p-3">City</th><th className="p-3 text-right">Places</th><th className="p-3 text-right">With a menu</th><th className="p-3 text-right">Chain menu</th><th className="p-3 text-right">Own menu</th><th className="p-3 text-right">Has a website or menu link</th></tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {rows.map((r) => (
                <tr key={r.city_slug}>
                  <td className="p-3 font-semibold">{cityName(r.city_slug)}</td>
                  <td className="p-3 text-right">{r.places}</td>
                  <td className="p-3 text-right">{r.with_menu} <span className="text-faint">({pct(r.with_menu, r.places)})</span></td>
                  <td className="p-3 text-right">{r.with_brand_menu}</td>
                  <td className="p-3 text-right">{r.with_own_menu}</td>
                  <td className="p-3 text-right">{r.with_menu_link}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="brands-h" className="flex flex-col gap-2">
        <h2 id="brands-h" className="font-bold">Chain menus ({(brands ?? []).length})</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {((brands ?? []) as unknown as BrandRow[]).map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
              <span className="min-w-0">
                <b className="block truncate">{b.name}</b>
                <span className="text-xs text-muted tabular-nums">{b.items[0]?.count ?? 0} items · {b.places[0]?.count ?? 0} locations · checked {b.menu_verified}</span>
              </span>
              {b.menu_url && <a href={b.menu_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-sky hover:underline">Source ↗</a>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="src-h" className="flex flex-col gap-2">
        <h2 id="src-h" className="font-bold">Restaurant menu sources</h2>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
          {((sources ?? []) as unknown as SourceRow[]).map((s) => (
            <li key={`${s.business?.slug}-${s.url}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>{s.business ? <Link href={`/venue/${s.business.slug}`} className="font-semibold hover:underline">{s.business.name}</Link> : "—"}
                <span className="text-muted"> · {s.status}{s.items ? ` · ${s.items} items` : ""}{s.last_checked ? ` · ${s.last_checked}` : ""}</span></span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate text-xs text-sky hover:underline">{s.url.replace(/^https:\/\//, "")}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
