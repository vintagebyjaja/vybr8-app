import Link from "next/link";

/** "What Should I Eat?" hero: goes to the Vybe Plan tuned to today's activity. */
export function WhatToEatCard({ href, photo }: { href: string; photo: string }) {
  return (
    <Link href={href} className="relative flex h-44 overflow-hidden rounded-[var(--radius-card)] border border-line sm:h-52">
      {/* eslint-disable-next-line @next/next/no-img-element -- local brand/post image */}
      <img src={photo} alt="" className="absolute inset-y-0 right-0 h-full w-2/3 object-cover" />
      <div className="relative flex w-3/5 flex-col justify-between bg-[linear-gradient(135deg,var(--color-coral),#b86bd6_70%,transparent)] p-5 [clip-path:polygon(0_0,100%_0,82%_100%,0_100%)]">
        <p className="font-display text-3xl font-extrabold leading-tight text-white">What Should I&nbsp;Eat?</p>
        <span className="grid size-11 place-items-center rounded-full bg-white/85 text-xl font-bold text-coral" aria-hidden>→</span>
      </div>
    </Link>
  );
}
