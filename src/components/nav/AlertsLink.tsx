import Link from "next/link";

export function AlertsLink({ unread }: { unread: number }) {
  return (
    <Link href="/notifications" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"} className="relative grid size-11 place-items-center rounded-full border border-line bg-surface hover:bg-surface-2">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="vybe-gradient absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-extrabold text-ink tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
