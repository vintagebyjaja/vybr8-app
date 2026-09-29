/** One search box for everything: dishes, drinks, places, chefs, food trucks. Plain GET form, works without JS. */
export function SearchBox({ q = "", tab }: { q?: string; tab?: string }) {
  return (
    <form action="/search" role="search" className="flex gap-2">
      <label htmlFor="q" className="sr-only">Search VYBR8</label>
      <input
        id="q" name="q" defaultValue={q} maxLength={120} autoComplete="off"
        placeholder="Best wings near me · Private chef for a birthday · Food trucks open tonight"
        className="min-h-12 flex-1 rounded-full border border-line bg-surface px-5 text-sm placeholder:text-faint focus:border-sky"
      />
      {tab && tab !== "all" && <input type="hidden" name="tab" value={tab} />}
      <button className="vybe-gradient min-h-12 rounded-full px-6 text-sm font-bold text-ink">Search</button>
    </form>
  );
}
