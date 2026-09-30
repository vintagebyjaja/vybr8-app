import Link from "next/link";
import { COMMUNITY_KINDS, LINK_INFO, LINK_KINDS, searchLinks, type LinkGroup, type LinkKind } from "@/domain/places/links";
import type { PlaceLink } from "@/server/place-links";
import { addPlaceLink, removePlaceLink } from "@/app/(app)/venue/link-actions";

const GROUPS: { key: LinkGroup; label: string; icon: string }[] = [
  { key: "menu", label: "Menu", icon: "📋" },
  { key: "order", label: "Order", icon: "🛵" },
  { key: "reserve", label: "Reserve", icon: "📅" },
  { key: "follow", label: "Follow", icon: "📸" },
];
const pill = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-bold hover:bg-surface-2";
const TONE: Partial<Record<LinkKind, string>> = {
  doordash: "border-coral/50", ubereats: "border-mint/50", grubhub: "border-orange/50", postmates: "border-line",
  opentable: "border-coral/50", resy: "border-coral/50", tock: "border-sky/50", instagram: "border-lavender/50", tiktok: "border-sky/50", facebook: "border-sky/50",
};

type Props = {
  businessId: string; name: string; cityName: string; kind: string; website: string | null; links: PlaceLink[];
  compact?: boolean; noSearch?: boolean; signedIn?: boolean; canManage?: boolean; back?: string; saved?: boolean; error?: string | null;
};

/**
 * Where to see the menu, order, book a table or follow a place. Real links first (from the owner, the Team,
 * the community or OpenStreetMap), then clearly labeled searches for anything missing.
 */
export function PlaceLinks({ businessId, name, cityName, kind, website, links, compact = false, noSearch = false, signedIn = false, canManage = false, back, saved, error }: Props) {
  const byKind = new Map(links.map((l) => [l.kind, l]));
  const official: { kind: LinkKind; url: string; link?: PlaceLink }[] = [];
  if (website && !byKind.has("website")) official.push({ kind: "website", url: website });
  for (const k of LINK_KINDS) { const l = byKind.get(k); if (l) official.push({ kind: k, url: l.url, link: l }); }
  const has = (g: LinkGroup) => official.some((o) => LINK_INFO[o.kind].group === g);
  const searches = searchLinks(name, cityName, kind).filter((s) => !has(s.group) && !byKind.has(s.key as LinkKind));

  if (compact) {
    const top = official.filter((o) => o.kind !== "facebook" && o.kind !== "tiktok").slice(0, 4);
    const menuSearch = !has("menu") && !noSearch ? searches.find((s) => s.key === "menu") : null;
    if (!top.length && !menuSearch) return null;
    return (
      <span className="flex flex-wrap gap-1.5">
        {top.map((o) => (
          <a key={o.kind} href={o.url} target="_blank" rel="noopener noreferrer nofollow" className={`${pill} ${TONE[o.kind] ?? ""}`}>
            {LINK_INFO[o.kind].group === "order" ? "🛵 " : LINK_INFO[o.kind].group === "reserve" ? "📅 " : LINK_INFO[o.kind].group === "follow" ? "📸 " : "📋 "}{LINK_INFO[o.kind].short}
          </a>
        ))}
        {menuSearch && <a href={menuSearch.url} target="_blank" rel="noopener noreferrer nofollow" className={pill}>📋 Find menu</a>}
      </span>
    );
  }

  return (
    <section id="links" aria-labelledby="links-h" className="flex scroll-mt-4 flex-col gap-3">
      <h2 id="links-h" className="text-xl font-bold">Menu, order &amp; reserve</h2>
      {saved && <p role="status" className="rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">Thanks! The link is live for everyone.</p>}
      {error && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{error}</p>}

      {official.length > 0 ? (
        <div className="flex flex-col gap-2">
          {GROUPS.map((g) => {
            const items = official.filter((o) => LINK_INFO[o.kind].group === g.key);
            if (!items.length) return null;
            return (
              <div key={g.key} className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wide text-faint">{g.icon} {g.label}</span>
                {items.map((o) => (
                  <span key={o.kind} className="inline-flex items-center gap-1">
                    <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-bold hover:bg-surface-2 ${TONE[o.kind] ?? "border-line"}`}>
                      {LINK_INFO[o.kind].label} <span aria-hidden className="ml-1 text-faint">↗</span>
                    </a>
                    {back && o.link && (canManage || o.link.mine) && (
                      <form action={removePlaceLink}>
                        <input type="hidden" name="business" value={businessId} /><input type="hidden" name="kind" value={o.kind} /><input type="hidden" name="back" value={back} />
                        <button aria-label={`Remove ${LINK_INFO[o.kind].label} link`} className="grid size-7 place-items-center rounded-full text-faint hover:text-danger">×</button>
                      </form>
                    )}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">No links on VYBR8 yet.</p>
      )}

      {searches.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{official.length ? "Not listed yet? Search:" : "Search for them on:"}</span>
          {searches.map((s) => <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full border border-line px-3 py-1.5 font-semibold hover:text-text">{s.label}</a>)}
        </p>
      )}

      {back && (signedIn ? (
        <details className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <summary className="cursor-pointer list-none font-bold text-sky">+ Know their DoorDash, Instagram or OpenTable? Add it</summary>
          <form action={addPlaceLink} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="business" value={businessId} /><input type="hidden" name="back" value={back} />
            <label className="sr-only" htmlFor={`lk-${businessId}`}>Link type</label>
            <select id={`lk-${businessId}`} name="kind" className="min-h-11 rounded-xl border border-line bg-ink px-3">
              {(canManage ? LINK_KINDS : COMMUNITY_KINDS).map((k) => <option key={k} value={k}>{LINK_INFO[k].label}</option>)}
            </select>
            <label className="sr-only" htmlFor={`lu-${businessId}`}>Link</label>
            <input id={`lu-${businessId}`} name="url" required maxLength={400} inputMode="url" placeholder="https://www.doordash.com/store/… or @handle"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 placeholder:text-faint" />
            <button className="min-h-11 rounded-full bg-text px-5 font-bold text-ink">Add link</button>
          </form>
          <p className="mt-2 text-xs text-faint">Only real links on each service&rsquo;s own site are accepted. {canManage ? "You can also set their website, menu and ordering links." : "Menu and website links come from the business or the VYBR8 Team."}</p>
        </details>
      ) : (
        <p className="text-xs text-muted"><Link href={`/auth/sign-in?next=${encodeURIComponent(back)}`} className="font-semibold text-sky">Sign in</Link> to add a DoorDash, Instagram or OpenTable link.</p>
      ))}
    </section>
  );
}
