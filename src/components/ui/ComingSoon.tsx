/** Honest placeholder for routes whose phase has not shipped yet. Shows no invented data. */
export function ComingSoon({ title, tagline, phase, points }: { title: string; tagline: string; phase: string; points: string[] }) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">{phase}</p>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        <p className="text-muted">{tagline}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {points.map((p) => (
          <li key={p} className="flex gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            <span aria-hidden className="vybe-text font-bold">•</span>
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
