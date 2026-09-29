export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "explore" },
  { href: "/vybe", label: "Vybe", icon: "vybe" },
  { href: "/health", label: "Health", icon: "health" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
