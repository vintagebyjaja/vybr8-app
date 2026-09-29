/** Required on anything backed by mock or seed data (spec §2). */
export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-lavender/40 bg-lavender/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-lavender">
      {label}
    </span>
  );
}
