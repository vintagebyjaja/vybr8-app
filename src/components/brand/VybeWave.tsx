"use client";

import { useEffect, useRef } from "react";

/**
 * The VYBR8 frequency: each brand colour is its own wave (Eat, Drink, Link Up, Health),
 * with a faint lavender carrier underneath. Decorative; respects reduced motion.
 */
const WAVES = [
  { c: "#c6afff", f: 0.8, a: 0.16, s: 0.35, p: 0.0, w: 1.4, glow: 0 },
  { c: "#ffb27a", f: 1.5, a: 0.34, s: 0.9, p: 0.0, w: 2.6, glow: 14 },
  { c: "#ff8193", f: 2.4, a: 0.26, s: 1.3, p: 1.3, w: 2.6, glow: 14 },
  { c: "#9fd2ff", f: 1.1, a: 0.38, s: 0.65, p: 2.6, w: 2.6, glow: 14 },
  { c: "#94e3b8", f: 3.2, a: 0.14, s: 1.7, p: 3.9, w: 1.8, glow: 10 },
] as const;

const LEGEND = [
  { label: "Eat", color: "bg-orange" },
  { label: "Drink", color: "bg-coral" },
  { label: "Link Up", color: "bg-sky" },
  { label: "Health", color: "bg-mint" },
];

export function VybeWave() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      const breathe = 0.85 + 0.15 * Math.sin(t * 0.9);
      for (const v of WAVES) {
        ctx.strokeStyle = v.c;
        ctx.lineWidth = v.w;
        ctx.lineCap = "round";
        ctx.shadowColor = v.c;
        ctx.shadowBlur = v.glow;
        ctx.globalAlpha = v.glow ? 0.9 : 0.55;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const u = x / w;
          const env = Math.pow(Math.sin(Math.PI * u), 1.6);
          const y =
            h / 2 +
            Math.sin(u * Math.PI * 2 * v.f + t * v.s + v.p) * v.a * h * env * breathe +
            Math.sin(u * Math.PI * 9 + t * 2.1 + v.p) * 0.018 * h * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    const loop = (ms: number) => {
      draw(ms / 1000);
      raf = requestAnimationFrame(loop);
    };
    const onResize = () => {
      size();
      draw(1.2);
    };

    size();
    draw(1.2);
    window.addEventListener("resize", onResize);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <figure className="m-0 overflow-hidden rounded-[22px] border border-line bg-[radial-gradient(120%_90%_at_50%_50%,#151222_0%,var(--color-ink)_70%)]">
      <canvas ref={ref} role="img" aria-label="The VYBR8 frequency" className="block h-[clamp(150px,24vw,230px)] w-full" />
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line px-4 py-3">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted">
            <i className={`inline-block h-[3px] w-[18px] rounded ${l.color}`} />
            {l.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
