"use client";

import Link from "@/components/ui/Link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ROASTS, ROAST_EMOJIS, ROAST_HOME, nextRoast, roastKindFor, type RoastKind } from "@/domain/errors/roasts";

/**
 * VYBR8's branded 404. The roast is picked after the page loads in the browser,
 * so the server and browser render the same markup (no hydration mismatch). The URL is left as is.
 */
export function Roast404({ kind: forced }: { kind?: RoastKind }) {
  const pathname = usePathname();
  const [kind, setKind] = useState<RoastKind>(forced ?? "food");
  const [index, setIndex] = useState<number | null>(null);
  const [swap, setSwap] = useState(0);

  useEffect(() => {
    const k = forced ?? roastKindFor(pathname, window.location.search);
    setKind(k);
    setIndex(nextRoast(k, null));
  }, [pathname, forced]);

  const roast = index == null ? null : ROASTS[kind][index];
  const home = ROAST_HOME[kind];

  return (
    <main className="roast404 relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#101014] px-5 py-12 text-center text-text">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {ROAST_EMOJIS[kind].map((e, i) => (
          <span key={`${kind}-${i}`} className="roast404-float absolute text-3xl opacity-20 sm:text-4xl"
            style={{ left: `${8 + i * 20}%`, top: `${i % 2 ? 72 : 14}%`, animationDelay: `${i * 0.9}s` }}>{e}</span>
        ))}
      </div>

      <div className="roast404-in flex w-full max-w-xl flex-col items-center gap-6">
        <Link href="/" aria-label="VYBR8 home" className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral">
          <Image src="/brand-wordmark.webp" alt="VYBR8" width={180} height={60} priority className="h-auto w-40 mix-blend-lighten sm:w-48" />
        </Link>

        <p aria-hidden className="roast404-glow font-display text-[7rem] font-extrabold leading-none text-coral sm:text-[10rem]">404</p>

        <div className="flex min-h-[9.5rem] flex-col items-center justify-center gap-3" aria-live="polite">
          {roast && (
            <div key={`${kind}-${index}-${swap}`} className="roast404-swap flex flex-col gap-3">
              <h1 className="font-display text-3xl font-extrabold uppercase leading-tight tracking-tight sm:text-5xl">{roast.headline}</h1>
              <p className="text-lg text-muted sm:text-xl">{roast.subtitle}</p>
            </div>
          )}
          {!roast && <h1 className="sr-only">Page not found</h1>}
        </div>

        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link href={home.href}
            className="roast404-btn inline-flex min-h-14 w-full items-center justify-center rounded-full bg-coral px-7 text-lg font-extrabold text-ink shadow-[0_0_32px_rgba(255,129,147,.45)] sm:w-auto">
            {home.label}
          </Link>
          <button type="button" onClick={() => { setIndex((i) => nextRoast(kind, i)); setSwap((s) => s + 1); }}
            className="roast404-btn inline-flex min-h-12 w-full items-center justify-center rounded-full border border-coral/50 px-6 font-bold text-coral sm:w-auto">
            Roast Me Again 🔀
          </button>
        </div>
      </div>
    </main>
  );
}
