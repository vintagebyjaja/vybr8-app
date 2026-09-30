import Link from "next/link";

export function RangeTabs({ active, hrefFor }: { active: "day" | "week" | "month"; hrefFor: (r: string) => string }) {
  return (
    <nav aria-label="Range" className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1">
      {(["day", "week", "month"] as const).map((r) => (
        <Link key={r} href={hrefFor(r)} aria-current={active === r ? "page" : undefined}
          className={`rounded-xl py-2.5 text-center text-sm font-bold capitalize ${active === r ? "bg-text text-ink" : "text-muted hover:text-text"}`}>
          {r}
        </Link>
      ))}
    </nav>
  );
}
