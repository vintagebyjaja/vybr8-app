import Link from "next/link";
import { BUSINESS_PLANS, CONSUMER_PLANS, PAID_PLACEMENT_RULES, formatPrice, type PlanCard } from "@/domain/plans/plans";
import { getViewer } from "@/server/auth";
import { getPlan } from "@/server/entitlements";

export const metadata = { title: "Pricing" };

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function PricingPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const business = tab === "business";
  const [viewer, plan] = await Promise.all([getViewer(), getPlan()]);
  const current = viewer ? plan.plan : null;
  const plans = business ? BUSINESS_PLANS : CONSUMER_PLANS;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-4xl font-extrabold">Pick your <span className="vybe-text">vybe</span></h1>
        <p className="mx-auto max-w-prose text-muted">Rating food and drinks is free, always. Upgrade when you want to go deeper.</p>
        <nav aria-label="Pricing for" className="mx-auto flex rounded-full border border-line p-1">
          {[{ k: "you", l: "FOR YOU", h: "/pricing" }, { k: "business", l: "FOR BUSINESS", h: "/pricing?tab=business" }].map((t) => {
            const on = (t.k === "business") === business;
            return (
              <Link key={t.k} href={t.h} aria-current={on ? "page" : undefined} className={`min-h-10 rounded-full px-5 py-2 text-sm font-bold ${on ? "vybe-gradient text-ink" : "text-muted hover:text-text"}`}>
                {t.l}
              </Link>
            );
          })}
        </nav>
      </header>

      <ul className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <li key={p.code}><Plan p={p} current={!business && current === p.code} business={business} /></li>
        ))}
      </ul>

      {business ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm">
          <h2 className="font-bold">Promoted placement is separate</h2>
          <p className="text-muted">Businesses, food trucks and chefs will be able to buy promoted spots (Near You, Food Trucks Today, This Weekend and more). They&rsquo;re not part of any plan, and we&rsquo;ll share pricing when they open.</p>
          <ul className="mt-1 flex flex-col gap-1">{PAID_PLACEMENT_RULES.map((r) => <li key={r}>• {r}</li>)}</ul>
          <p className="mt-2 text-muted">Chefs: your Chef Profile is free. <Link href="/chef/dashboard" className="font-semibold text-sky">Create yours</Link>. Food trucks manage schedules on Business Free. <Link href="/food-truck/dashboard" className="font-semibold text-sky">Truck dashboard</Link></p>
        </section>
      ) : (
        <p className="text-center text-xs text-faint">
          VYBR8 gives wellness and nutrition information, not medical advice. Nutrition values are labeled Verified, Restaurant provided, Database provided, Estimated or Unknown.
        </p>
      )}
    </div>
  );
}

function Plan({ p, current, business }: { p: PlanCard; current: boolean; business: boolean }) {
  return (
    <article className={`flex h-full flex-col gap-4 rounded-[var(--radius-card)] p-6 ${p.highlight ? "vybe-ring" : "border border-line bg-surface"}`}>
      <div>
        <h2 className="font-display text-xl font-extrabold">{p.name}</h2>
        {p.headline && <p className="mt-2 font-display text-sm font-extrabold tracking-wide vybe-text">{p.headline}</p>}
        <p className="mt-1 text-sm text-muted">{p.tagline}</p>
      </div>
      <p>
        <span className="font-display text-4xl font-extrabold">{formatPrice(p.monthly)}</span>
        {p.monthly > 0 && <span className="text-muted">/mo</span>}
        {p.yearly != null && p.yearly > 0 && <span className="block text-sm text-muted">or {formatPrice(p.yearly)}/year</span>}
      </p>
      <ul className="flex flex-1 flex-col gap-1.5 text-sm">
        {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-coral">✓</span><span>{f}</span></li>)}
      </ul>
      {current ? (
        <p className="rounded-full border border-line py-2.5 text-center text-sm font-bold text-muted">Your plan</p>
      ) : p.monthly === 0 ? (
        <Link href={business ? "/business" : "/auth/sign-up"} className="rounded-full border border-line py-2.5 text-center text-sm font-bold hover:bg-surface-2">{business ? "Claim your business" : "Start free"}</Link>
      ) : (
        <button disabled className={`rounded-full py-2.5 text-sm font-bold ${p.highlight ? "vybe-gradient text-ink" : "border border-line"} opacity-70`} title="Checkout opens soon">
          Upgrades open soon
        </button>
      )}
    </article>
  );
}
