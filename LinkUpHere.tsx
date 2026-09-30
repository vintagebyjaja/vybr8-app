import Link from "next/link";

/** "Link Up here": start a Link Up at this place, for friends, anyone (18+) or just the people you invite. */
export function LinkUpHere({ venueSlug, signedIn, isAdult, compact = false }: { venueSlug: string; signedIn: boolean; isAdult: boolean; compact?: boolean }) {
  const to = (who: string) => {
    const href = `/vybe/new?${new URLSearchParams({ venue: venueSlug, who })}`;
    return signedIn ? href : `/auth/sign-in?next=${encodeURIComponent(href)}`;
  };
  const options = [
    { who: "friends", label: "Invite my friends", line: "Your VYBR8 friends can join" },
    ...(isAdult || !signedIn ? [{ who: "public", label: "Open to the public", line: "Anyone 18+ in the city can join" }] : []),
    { who: "invite_only", label: "Invite only", line: "Just the people you send it to" },
  ];
  return (
    <details className="group relative">
      <summary className={`list-none cursor-pointer ${compact
        ? "grid size-10 place-items-center rounded-full border border-coral/60 text-coral hover:bg-coral/10"
        : "vybe-ring inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold"}`} aria-label={compact ? "Link Up here" : undefined}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
          <path d="M18.2 8.5a4 4 0 1 1 0 7c-2.2 0-3.6-1.8-6.2-3.5-2.6-1.7-4-3.5-6.2-3.5a4 4 0 1 0 0 7c2.2 0 3.6-1.8 6.2-3.5 2.6-1.7 4-3.5 6.2-3.5z" />
        </svg>
        {!compact && "Link Up here"}
      </summary>
      <div className="absolute left-0 top-full z-30 mt-2 flex w-60 flex-col rounded-xl border border-line bg-surface-2 p-1 shadow-xl">
        {options.map((o) => (
          <Link key={o.who} href={to(o.who)} className="rounded-lg px-3 py-2 hover:bg-surface">
            <span className="block text-sm font-bold">{o.label}</span>
            <span className="block text-xs text-muted">{o.line}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}
