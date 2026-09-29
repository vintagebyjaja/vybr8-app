import Link from "next/link";
import { CITIES } from "@/domain/map/map";

/** City picker for charts: plain links, so it works without JavaScript and each city has its own shareable URL. */
export function CityChips({ current, hrefFor }: { current: string; hrefFor: (city: string) => string }) {
  return (
    <nav aria-label="City" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {CITIES.map((c) => (
        <Link
          key={c.slug}
          href={hrefFor(c.slug)}
          aria-current={c.slug === current ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${c.slug === current ? "bg-text text-ink" : "border border-line text-muted hover:text-text"}`}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
