import Link from "next/link";
import { WINDOW_LABEL } from "@/domain/birthday/birthday";
import { PERK_TYPE_LABEL, type BirthdayPerk } from "@/domain/birthday/perks";
import { DemoBadge } from "@/components/ui/DemoBadge";

const TONE = {
  free_food: "text-orange border-orange/40 bg-orange/10",
  free_drink: "text-sky border-sky/40 bg-sky/10",
  discount: "text-coral border-coral/40 bg-coral/10",
  other: "text-lavender border-lavender/40 bg-lavender/10",
} as const;

export function PerkCard({ perk, usableNow, showVenue = true }: { perk: BirthdayPerk; usableNow?: boolean; showVenue?: boolean }) {
  const confirmed = perk.lastConfirmedAt ? new Date(perk.lastConfirmedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  return (
    <article className={`flex h-full flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-5 ${usableNow ? "vybe-ring" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TONE[perk.perkType]}`}>{PERK_TYPE_LABEL[perk.perkType]}</span>
        <span className="text-xs font-semibold text-muted">{WINDOW_LABEL[perk.window]}</span>
        {perk.isAlcoholic && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-bold text-muted">21+</span>}
        {usableNow && <span className="vybe-gradient rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-ink">Use it now</span>}
        {perk.isDemo && <DemoBadge label="Demo" />}
      </div>
      <h3 className="font-display text-lg font-bold">{perk.title}</h3>
      {showVenue && (
        <Link href={`/venue/${perk.business.slug}`} className="-mt-2 text-sm font-semibold text-sky hover:underline">
          {perk.business.name}
          {perk.business.city ? ` · ${perk.business.city}` : ""}
        </Link>
      )}
      {perk.details && <p className="text-sm text-muted">{perk.details}</p>}
      {perk.requirements && <p className="text-xs text-faint">Needs: {perk.requirements}</p>}
      <p className="mt-auto text-xs text-faint">
        {perk.source === "business" ? "From the business" : perk.source === "vybr8" ? "Confirmed by VYBR8" : "Community tip, reviewed by VYBR8"}
        {confirmed && ` · confirmed ${confirmed}`}
      </p>
    </article>
  );
}
