import Link from "next/link";

export function FeedTabs<T extends string>({ tabs, active, base, param = "feed", extra }: { tabs: readonly { key: T; label: string }[]; active: T; base: string; param?: string; extra?: string }) {
  return (
    <nav aria-label="Feed" className="flex gap-1 rounded-full border border-line bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${base}?${extra ? `${extra}&` : ""}${param}=${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          className={`flex min-h-10 flex-1 items-center justify-center rounded-full px-4 text-sm font-bold ${active === t.key ? "vybe-gradient text-ink" : "text-muted hover:text-text"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
