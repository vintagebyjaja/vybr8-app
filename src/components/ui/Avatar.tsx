import { avatarSrc } from "@/lib/avatar";

const SIZES = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-16 text-xl", xl: "size-24 text-3xl" } as const;

/** Round profile photo with a gradient ring; falls back to the first letter of the name. */
export function Avatar({ path, name, size = "md", ring = true, verified = false }: { path?: string | null; name: string; size?: keyof typeof SIZES; ring?: boolean; verified?: boolean }) {
  const src = avatarSrc(path);
  return (
    <span className={`relative inline-grid shrink-0 place-items-center rounded-full ${ring ? "vybe-gradient p-[2px]" : ""} ${SIZES[size]}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- storage URL, small
        <img src={src} alt="" className="size-full rounded-full border-2 border-ink object-cover" />
      ) : (
        <span aria-hidden className="grid size-full place-items-center rounded-full border-2 border-ink bg-surface-2 font-display font-extrabold">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {verified && (
        <span title="ID verified" className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border-2 border-ink bg-sky text-[9px] font-black text-ink">✓</span>
      )}
    </span>
  );
}
