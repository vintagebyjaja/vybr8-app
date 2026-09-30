/** "What are you craving?" in your own words. Works without AI: the words map to craving tags. */
export function CraveSearch({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/cravezone/results" role="search" className="flex gap-2">
      <label htmlFor="crave-q" className="sr-only">What are you craving?</label>
      <input id="crave-q" name="q" defaultValue={defaultValue} maxLength={120} autoFocus={autoFocus} autoComplete="off"
        placeholder="Something sweet but not too heavy…"
        className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-5 placeholder:text-faint focus:border-coral" />
      <button className="vybe-gradient min-h-12 shrink-0 rounded-full px-5 font-bold text-ink" aria-label="Search cravings">Crave it</button>
    </form>
  );
}
