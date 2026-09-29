"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExploreIcon, HealthIcon, HomeIcon, InfinityIcon, ProfileIcon } from "./icons";
import { NAV_ITEMS, isActive } from "./nav-items";

const ICONS = { home: HomeIcon, explore: ExploreIcon, health: HealthIcon, profile: ProfileIcon, vybe: InfinityIcon };

/** Mobile tab bar. VYBE sits in the middle as the primary action. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/90 backdrop-blur-lg md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = ICONS[item.icon];
          if (item.icon === "vybe") {
            return (
              <li key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="-mt-6 flex flex-col items-center gap-1 text-[11px] font-semibold tracking-wide"
                >
                  <span className="vybe-gradient grid size-14 place-items-center rounded-full text-ink shadow-lg motion-safe:animate-vybe-pulse">
                    <Icon className="size-7" />
                  </span>
                  <span className={active ? "vybe-text" : "text-muted"}>VYBE</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-14 flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-medium uppercase tracking-wide ${
                  active ? "text-text" : "text-faint hover:text-muted"
                }`}
              >
                <Icon className={`size-6 ${active ? "text-coral" : ""}`} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
