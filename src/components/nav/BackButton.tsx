"use client";

import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

// Tab screens (the bottom bar) don't get a back button; everything else does.
const ROOTS = new Set<string>(NAV_ITEMS.map((i) => i.href));

/** One step back: the previous screen when there is one, otherwise the page one level up. */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (ROOTS.has(pathname)) return <span aria-hidden />;

  function goBack() {
    const cameFromVybr8 = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (cameFromVybr8 && window.history.length > 1) {
      router.back();
    } else {
      const up = pathname.split("/").slice(0, -1).join("/") || "/";
      router.push(up);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-4 text-sm font-semibold hover:bg-surface-2"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
      Back
    </button>
  );
}
