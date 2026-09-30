import Image from "next/image";
import Link from "next/link";
import { CitySkyline } from "@/components/home/CitySkyline";

// Real city photos (1400×700 WebP in /public/cities). Any city without one falls back to the drawn skyline.
const PHOTOS = new Set(["charlotte", "atlanta", "nashville", "houston", "phoenix", "dc", "brooklyn", "miami"]);

/** "What Should I Eat?" hero over the selected city. No restaurant is featured: the vybers decide who's best. */
export function WhatToEatCard({ href, city, cityName }: { href: string; city: string; cityName: string }) {
  return (
    <Link href={href} className="relative flex h-44 overflow-hidden rounded-[var(--radius-card)] border border-line sm:h-56">
      {PHOTOS.has(city) ? (
        <Image src={`/cities/${city}.webp`} alt={`${cityName} skyline`} fill priority sizes="(min-width: 768px) 900px, 100vw" className="object-cover" />
      ) : (
        <CitySkyline city={city} className="absolute inset-0 size-full" />
      )}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,129,147,.92)_0%,rgba(184,107,214,.75)_38%,rgba(7,6,11,.15)_62%,transparent_80%)]" />
      <div className="relative flex w-3/5 flex-col justify-between p-5">
        <div>
          <p className="font-display text-3xl font-extrabold leading-tight text-white drop-shadow">What Should I&nbsp;Eat?</p>
          <p className="mt-1 text-sm font-semibold text-white/90">in {cityName}</p>
        </div>
        <span className="grid size-11 place-items-center rounded-full bg-white/90 text-xl font-bold text-coral" aria-hidden>→</span>
      </div>
    </Link>
  );
}
