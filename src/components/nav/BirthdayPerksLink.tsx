"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Top-bar Birthday Perks. Hidden on the founder's own profile, which is for business and admin only. */
export function BirthdayPerksLink({ hideOn }: { hideOn: string | null }) {
  const path = usePathname();
  if (hideOn && path.toLowerCase() === hideOn.toLowerCase()) return null;
  return (
    <Link href="/birthday" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
      <span className="vybe-text">Birthday Perks</span>
    </Link>
  );
}
