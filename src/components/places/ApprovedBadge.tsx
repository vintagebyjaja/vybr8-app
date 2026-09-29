/** Shown on places whose owner proved it's theirs, and on chefs who claimed their profile. */
export function ApprovedBadge({ label = "VYBR8 Approved", small = false }: { label?: string; small?: boolean }) {
  return (
    <span
      title="The owner proved this listing is theirs to the VYBR8 Team"
      className={`vybe-gradient inline-flex items-center gap-1 rounded-full font-extrabold uppercase tracking-wider text-ink ${small ? "px-1.5 py-0 text-[9px] leading-4" : "px-2.5 py-0.5 text-[11px]"}`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className={small ? "size-2.5" : "size-3"}>
        <circle cx="8" cy="8" r="8" fill="currentColor" />
        <path d="M4.5 8.2l2.3 2.3 4.7-4.7" fill="none" stroke="var(--color-orange, #ffb27a)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}
