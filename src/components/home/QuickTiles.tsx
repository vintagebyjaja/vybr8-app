import Link from "next/link";

type Tile = { href: string; label: string; tone: string; icon: keyof typeof ICONS };

const s = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ICONS = {
  pin: <svg {...s}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  people: <svg {...s}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.8-3.4 3.2-5.2 6-5.2s5.2 1.8 6 5.2" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.6c2.6.2 4.3 1.9 5 4.9" /></svg>,
  trophy: <svg {...s}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M16 5h3v2a3 3 0 0 1-3 3M8 5H5v2a3 3 0 0 0 3 3" /><path d="M12 13v4M8.5 20h7l-.8-3h-5.4z" /></svg>,
  truck: <svg {...s}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></svg>,
  plate: <svg {...s}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><path d="M2 5v5M4 5v5M3 10v9M21 5c-1.4 1-2 2.6-2 4.5V12h2v7" /></svg>,
  glass: <svg {...s}><path d="M5 4h14l-7 8zM12 12v7M8 20h8" /></svg>,
  cake: <svg {...s}><path d="M4 20h16v-7H4zM4 16c2 1 4-1 6 0s4 1 6 0 3-1 4 0" /><path d="M12 13V9M12 6.5c.8-.6.8-1.8 0-2.5-.8.7-.8 1.9 0 2.5Z" /></svg>,
  plus: <svg {...s}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><path d="M12 6.8v5.4M9.3 9.5h5.4" /></svg>,
};

export function QuickTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-4 gap-2.5">
      {tiles.map((t) => (
        <li key={t.href + t.label}>
          <Link href={t.href} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition hover:border-coral/40 hover:bg-surface-2 sm:aspect-auto sm:py-4">
            <span className={`size-8 ${t.tone}`}>{ICONS[t.icon]}</span>
            <span className="text-[13px] font-semibold leading-tight">{t.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
