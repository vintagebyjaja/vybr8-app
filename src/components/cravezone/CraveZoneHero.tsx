import Link from "next/link";
import type { CravingCategory } from "@/domain/cravezone/cravezone";
import { tone } from "./tones";

const HOME_PICKS = ["sweet", "salty", "spicy", "fruity", "crunchy"];

/** The discovery card for Home, Explore and Health: "What are you craving?" */
export function CraveZoneHero({ categories, from }: { categories: CravingCategory[]; from?: "home" | "explore" | "health" }) {
  const picks = HOME_PICKS.map((s) => categories.find((c) => c.slug === s)).filter(Boolean) as CravingCategory[];
  const surprise = categories.length ? categories[Math.floor((Date.now() / 3.6e6) % categories.length)]!.slug : "sweet";
  return (
    <section aria-labelledby={`cz-${from ?? "x"}`} className="relative overflow-hidden rounded-[var(--radius-card)] border border-coral/40 bg-surface p-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-coral/20 blur-3xl" />
      <p className="font-display text-xs font-extrabold tracking-[0.2em] text-coral">CRAVEZONE 🍓</p>
      <h2 id={`cz-${from ?? "x"}`} className="mt-1 font-display text-2xl font-extrabold">What are you craving?</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {picks.map((c) => (
          <li key={c.slug}>
            <Link href={`/cravezone/results?c=${c.slug}`} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-bold ${tone(c.tone).chip}`}>
              <span aria-hidden>{c.emoji}</span>{c.name.toUpperCase()}
            </Link>
          </li>
        ))}
        <li><Link href={`/cravezone/results?c=${surprise}&surprise=1`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-bold hover:bg-surface-2"><span aria-hidden>🎲</span>SURPRISE ME</Link></li>
      </ul>
      <Link href="/cravezone" className="vybe-gradient mt-4 inline-flex min-h-11 items-center rounded-full px-6 font-display text-sm font-extrabold tracking-wide text-ink">ENTER CRAVEZONE</Link>
    </section>
  );
}
