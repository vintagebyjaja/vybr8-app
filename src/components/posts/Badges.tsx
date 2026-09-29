import { CREATOR_TYPES, type CreatorType } from "@/domain/posts/posts";

/** Verified creator badge: Big Back (food), Liquid Lover (drinks), or both. */
export function CreatorBadge({ type, size = "sm" }: { type: CreatorType; size?: "sm" | "md" }) {
  const tone =
    type === "big_back"
      ? "border-orange/50 bg-orange/10 text-orange"
      : type === "liquid_lover"
        ? "border-sky/50 bg-sky/10 text-sky"
        : "border-coral/50 bg-coral/10 text-coral";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${tone} ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10.5px]"
      }`}
      title={`Verified ${CREATOR_TYPES[type].label} creator`}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3 fill-current">
        <path d="M8 0l2 2.2 3-.3.3 3L15.5 7 14 9.5l.3 3-3 .3L8 15l-2.3-2.2-3-.3.3-3L1 7l1.8-2.1-.3-3 3 .3z" />
        <path d="M5 8l2 2 4-4" fill="none" stroke="#07060b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {CREATOR_TYPES[type].label}
    </span>
  );
}

/** VYBR8 Team badge, e.g. "Founder". */
export function TeamBadge({ title, size = "sm" }: { title: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`vybe-gradient inline-flex items-center rounded-full font-extrabold uppercase tracking-wider text-ink ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10.5px]"
      }`}
    >
      VYBR8 {title}
    </span>
  );
}
