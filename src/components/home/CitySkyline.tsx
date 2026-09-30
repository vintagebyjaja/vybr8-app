import { SKYLINES, windows, type Shape } from "@/domain/map/skylines";

/** An illustrated dusk skyline of the selected city. Brand art only: no restaurant is featured. */
export function CitySkyline({ city, className = "" }: { city: string; className?: string }) {
  const sky = SKYLINES[city] ?? SKYLINES.charlotte!;
  const id = `sky-${city}`;
  const draw = (s: Shape, i: number, fill: string, lit: boolean) => {
    if (s.t === "rect") {
      const h = s.h ?? 200 - s.y;
      return (
        <g key={i}>
          <rect x={s.x} y={s.y} width={s.w} height={h} fill={fill} />
          {lit && s.lit && windows(s.x, s.y, s.w, h).map((p, j) => <rect key={j} x={p.x} y={p.y} width="2.5" height="3" fill="#ffc98f" opacity=".85" />)}
        </g>
      );
    }
    if (s.t === "poly") return <polygon key={i} points={s.pts} fill={fill} />;
    if (s.t === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={fill} />;
    return s.stroke
      ? <path key={i} d={s.d} fill="none" stroke={fill} strokeWidth={s.stroke} strokeLinecap="round" strokeLinejoin="round" />
      : <path key={i} d={s.d} fill={fill} fillRule="evenodd" />;
  };
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a6b" />
          <stop offset=".45" stopColor="#c0578f" />
          <stop offset=".8" stopColor="#ff8a6b" />
          <stop offset="1" stopColor="#ffb27a" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#ffe3b3" />
          <stop offset="1" stopColor="#ffb27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${id}-g)`} />
      <circle cx="300" cy="150" r="60" fill={`url(#${id}-sun)`} />
      <circle cx="300" cy="150" r="22" fill="#ffd9a1" opacity=".9" />
      <g opacity=".75">{sky.back.map((s, i) => draw(s, i, "#4a2f5e", false))}</g>
      <g>{sky.front.map((s, i) => draw(s, i, "#120d1c", true))}</g>
    </svg>
  );
}
