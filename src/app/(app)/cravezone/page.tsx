import Link from "next/link";
import { CraveSearch } from "@/components/cravezone/CraveSearch";
import { CravingGrid } from "@/components/cravezone/CravingGrid";
import { getCravingCategories } from "@/server/cravezone";

export const metadata = { title: "CraveZone · What are you craving?", description: "Find the exact dish or drink you're craving near you, with VYBR8 scores, prices and distance." };

export default async function CraveZonePage() {
  const categories = await getCravingCategories();
  return (
    <div className="flex flex-col gap-8">
      <header className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-orange/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-0 size-64 rounded-full bg-coral/20 blur-3xl" />
        <p className="relative font-display text-sm font-extrabold tracking-[0.3em] text-coral">CRAVEZONE</p>
        <h1 className="relative mt-2 font-display text-4xl font-extrabold leading-none sm:text-6xl">WHAT ARE YOU <span className="vybe-text">CRAVING?</span></h1>
        <p className="relative mt-3 max-w-prose text-muted">Know what you want but not where to get it? Tell us the craving. We&rsquo;ll find the dish, where it is, how good it is, what it costs and how far.</p>
        <div className="relative mt-6 max-w-2xl"><CraveSearch /></div>
      </header>

      <section aria-labelledby="pick-h" className="flex flex-col gap-3">
        <h2 id="pick-h" className="text-xl font-bold">Or pick your craving</h2>
        <CravingGrid categories={categories} />
      </section>

      <p className="text-xs text-faint">
        CraveZone helps you find food you&rsquo;ll love. It isn&rsquo;t nutrition or medical advice. Scores come from VYBR8 ratings, never payments.{" "}
        <Link href="/eat" className="underline">Browse all places instead</Link>
      </p>
    </div>
  );
}
