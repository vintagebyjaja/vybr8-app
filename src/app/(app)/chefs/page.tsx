import Link from "next/link";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { CHEF_SERVICES, SERVICE_LABELS, parseChefFilters, priceSummary } from "@/domain/chefs/chefs";
import { CITIES } from "@/domain/map/map";
import { listChefs, type ChefCard } from "@/server/chefs";

export const metadata = { title: "Chefs" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm";
const label = "flex flex-col gap-1 text-xs font-semibold text-muted";

function ChefPhoto({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="vybe-gradient inline-grid size-16 shrink-0 place-items-center rounded-full p-[2px]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- chef-provided https URL, small
        <img src={url} alt="" className="size-full rounded-full border-2 border-ink object-cover" />
      ) : (
        <span aria-hidden className="grid size-full place-items-center rounded-full border-2 border-ink bg-surface-2 font-display text-xl font-extrabold">
          {name.replace(/^chef\s+/i, "").slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function availabilityChips(c: ChefCard): { text: string; tone: "on" | "off" }[] {
  const chips: { text: string; tone: "on" | "off" }[] = [];
  if (c.restaurantOnly) chips.push({ text: "Restaurant only", tone: "off" });
  else chips.push(c.accepting ? { text: "Accepting clients", tone: "on" } : { text: "Not accepting clients", tone: "off" });
  if (c.availableEvents) chips.push({ text: "Available for events", tone: "on" });
  if (c.availableCatering) chips.push({ text: "Catering", tone: "on" });
  if (c.availablePrivateDining) chips.push({ text: "Private dining", tone: "on" });
  if (c.availableMealPrep) chips.push({ text: "Meal prep", tone: "on" });
  return chips;
}

function ChefCardView({ c }: { c: ChefCard }) {
  const prices = priceSummary(c);
  return (
    <Link href={`/chef/${c.slug}`} className="flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition hover:bg-surface-2">
      <div className="flex items-start gap-3">
        <ChefPhoto url={c.photoUrl} name={c.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold leading-tight">{c.name}</h3>
            {c.verified && <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[11px] font-bold text-sky">Verified</span>}
            {c.isDemo && <DemoBadge label="Demo" />}
          </div>
          {c.headline && <p className="text-sm text-muted">{c.headline}</p>}
          {(c.serviceArea || c.cityName) && <p className="text-xs text-faint">{c.serviceArea ?? c.cityName}</p>}
        </div>
      </div>
      {c.services.length > 0 && (
        <ul aria-label="Services" className="flex flex-wrap gap-1.5">
          {c.services.map((s) => <li key={s} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">{SERVICE_LABELS[s]}</li>)}
        </ul>
      )}
      {c.specialties.length > 0 && <p className="text-sm"><span className="text-faint">Cooks:</span> {c.specialties.join(" · ")}</p>}
      <ul aria-label="Availability" className="flex flex-wrap gap-1.5">
        {availabilityChips(c).map((a) => (
          <li key={a.text} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.tone === "on" ? "bg-orange/15 text-orange" : "bg-surface-2 text-faint"}`}>{a.text}</li>
        ))}
      </ul>
      {prices.length > 0 && <p className="mt-auto text-sm font-semibold">{prices.join(" · ")} <span className="text-xs font-normal text-faint">estimates</span></p>}
    </Link>
  );
}

export default async function ChefsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseChefFilters(params, CITIES.map((c) => c.slug));
  const chefs = await listChefs(filters);
  const filtered = !!(filters.city || filters.service || filters.cuisine || filters.accepting || filters.maxBudget || filters.guests);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold">CHEFS</h1>
        <p className="max-w-prose text-muted">
          Find the chef behind the dishes you love, or book one for your night. Private chef for a birthday, chef that caters the whole party, weekly meal prep.
        </p>
      </header>

      <form method="get" action="/chefs" aria-label="Filter chefs" className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:grid-cols-3">
        <label className={label}>
          City
          <select name="city" defaultValue={filters.city ?? ""} className={input}>
            <option value="">Any city</option>
            {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className={label}>
          Service
          <select name="service" defaultValue={filters.service ?? ""} className={input}>
            <option value="">Any service</option>
            {CHEF_SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className={label}>
          Cuisine
          <input name="cuisine" defaultValue={filters.cuisine ?? ""} maxLength={40} placeholder="Soul food, vegan..." className={input} />
        </label>
        <label className={label}>
          Max budget ($)
          <input name="maxBudget" type="number" inputMode="numeric" min={1} defaultValue={filters.maxBudget ?? ""} placeholder="500" className={input} />
        </label>
        <label className={label}>
          Guests
          <input name="guests" type="number" inputMode="numeric" min={1} defaultValue={filters.guests ?? ""} placeholder="12" className={input} />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
          <input type="checkbox" name="accepting" value="1" defaultChecked={filters.accepting} className="size-5 accent-coral" />
          Accepting clients
        </label>
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-3">
          <button className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-bold text-ink">Find chefs</button>
          {filtered && <Link href="/chefs" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Clear</Link>}
        </div>
      </form>

      <section aria-labelledby="results-h" className="flex flex-col gap-3">
        <h2 id="results-h" className="text-xl font-bold">{filtered ? `${chefs.length} ${chefs.length === 1 ? "chef" : "chefs"} match` : "Chefs on VYBR8"}</h2>
        {chefs.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-muted">
            {filtered ? "No chefs match those filters yet. Try a bigger budget, another city, or fewer filters." : "No chefs here yet. New chefs join every week."}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">{chefs.map((c) => <li key={c.id}><ChefCardView c={c} /></li>)}</ul>
        )}
        <p className="text-xs text-faint">Prices are estimates. The chef confirms your quote.</p>
      </section>

      <section className="vybe-ring flex flex-col items-start gap-3 rounded-[var(--radius-card)] p-5">
        <h2 className="text-xl font-extrabold">Are you a chef? Create your free Chef Profile</h2>
        <p className="text-sm text-muted">Show your signature dishes, services and availability. Free for chefs.</p>
        <Link href="/chef/dashboard" className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Create your Chef Profile</Link>
      </section>
    </div>
  );
}
