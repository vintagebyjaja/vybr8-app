"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExploreIcon, HealthIcon, HomeIcon, InfinityIcon, ProfileIcon } from "./icons";
import { NAV_ITEMS, isActive } from "./nav-items";

const ICONS = { home: HomeIcon, explore: ExploreIcon, health: HealthIcon, profile: ProfileIcon, vybe: InfinityIcon };

/** Desktop navigation rail. Same destinations as the mobile tab bar. */
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-8 border-r border-line px-5 py-7 md:flex">
      <Link href="/" className="block" aria-label="VYBR8 home">
        <Image src="/brand-wordmark.webp" alt="VYBR8" width={180} height={60} priority className="h-auto w-40 mix-blend-lighten" />
      </Link>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = ICONS[item.icon];
          const isVybe = item.icon === "vybe";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isVybe
                    ? "vybe-ring my-2 text-text hover:bg-surface-2"
                    : active
                      ? "bg-surface-2 text-text"
                      : "text-muted hover:bg-surface hover:text-text"
                }`}
              >
                <Icon className={`size-5 ${isVybe || active ? "text-coral" : ""}`} />
                {isVybe ? "Find My Vybe" : item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/post/new" className="vybe-gradient flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-bold text-ink hover:brightness-110">
        <span aria-hidden className="text-lg leading-none">+</span> Post a Plate or Pour
      </Link>
      <div className="flex flex-col gap-2 text-sm font-semibold">
        <Link href="/groups" className="text-muted hover:text-text">Groups &amp; Family</Link>
        <Link href="/charts" className="text-muted hover:text-text">Charts</Link>
        <Link href="/chefs" className="text-muted hover:text-text">Chefs</Link>
        <Link href="/food-trucks" className="text-muted hover:text-text">Food Trucks</Link>
        <Link href="/birthday" className="text-muted hover:text-text">Birthday Perks</Link>
        <Link href="/pricing" className="text-muted hover:text-text">VYBR8 MAX</Link>
      </div>
      <Link href="/team" className="text-xs font-semibold text-faint hover:text-muted">VYBR8 Team</Link>
      <p className="mt-auto text-xs tracking-[0.2em] text-faint">EAT • DRINK • LINK UP</p>
    </nav>
  );
}
