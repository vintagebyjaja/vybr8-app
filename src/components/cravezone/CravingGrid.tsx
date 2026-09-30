import type { CravingCategory } from "@/domain/cravezone/cravezone";
import { tone } from "./tones";

/**
 * Pick one craving or combine a few (SWEET + COLD). Plain checkboxes in a GET form:
 * works without JavaScript and the result URL is shareable (/cravezone/results?c=sweet&c=cold_refreshing).
 */
export function CravingGrid({ categories, selected = [], compact = false }: { categories: CravingCategory[]; selected?: string[]; compact?: boolean }) {
  return (
    <form action="/cravezone/results" className="flex flex-col gap-4">
      <fieldset>
        <legend className="sr-only">Pick one or more cravings</legend>
        <ul className={`grid gap-2 ${compact ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
          {categories.map((c) => {
            const t = tone(c.tone);
            return (
              <li key={c.slug}>
                <label className={`group flex cursor-pointer select-none items-center gap-3 rounded-2xl border bg-gradient-to-br p-3 transition hover:brightness-125 has-[:checked]:ring-2 has-[:checked]:ring-text ${t.tile} ${compact ? "flex-col gap-1 py-3 text-center" : "min-h-16"}`}>
                  <input type="checkbox" name="c" value={c.slug} defaultChecked={selected.includes(c.slug)} className="sr-only" />
                  <span aria-hidden className={compact ? "text-2xl" : "text-3xl"}>{c.emoji}</span>
                  <span className={`font-display font-extrabold tracking-wide ${compact ? "text-[11px]" : "text-sm"}`}>{c.name.toUpperCase()}</span>
                  <span aria-hidden className="ml-auto hidden text-sm font-bold group-has-[:checked]:inline">✓</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className="vybe-gradient min-h-12 rounded-full px-7 font-display font-extrabold tracking-wide text-ink hover:brightness-110">FIND MY CRAVING</button>
        <span className="text-xs text-faint">Pick one, or mix a few: Salty + Crunchy, Sweet + Cold…</span>
      </div>
    </form>
  );
}
