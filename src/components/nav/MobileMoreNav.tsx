import Link from "next/link";

const LINKS = [
  { href: "/charts", label: "Charts", hot: true },
  { href: "/groups", label: "Groups & Family" },
  { href: "/chefs", label: "Chefs" },
  { href: "/food-trucks", label: "Food Trucks" },
  { href: "/places/new", label: "Add a place" },
  { href: "/pricing", label: "VYBR8 MAX" },
  { href: "/team", label: "VYBR8 Team" },
];

/** Phones: the extra destinations the desktop side rail lists, as a swipeable row under the top bar. */
export function MobileMoreNav() {
  return (
    <nav aria-label="More" className="md:hidden">
      <ul className="flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none]">
        {LINKS.map((l) => (
          <li key={l.href} className="shrink-0">
            <Link
              href={l.href}
              className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold ${l.hot ? "vybe-gradient text-ink" : "border border-line bg-surface text-muted hover:text-text"}`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
