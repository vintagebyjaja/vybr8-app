import Image from "next/image";
import Link from "next/link";
import type { FeedPost } from "@/domain/posts/feed-types";
import { POST_KINDS, formatPrice, formatRating, timeAgo } from "@/domain/posts/posts";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { CreatorBadge, TeamBadge } from "./Badges";
import { VybeButton } from "./VybeButton";

const KIND_TONE = { plate: "text-orange", pour: "text-sky", spot: "text-lavender" } as const;

/** Timeline card for a Plate, Pour or Spot. */
export function PostCard({ post, signedIn, priority = false }: { post: FeedPost; signedIn: boolean; priority?: boolean }) {
  const rating = formatRating(post.rating);
  const price = formatPrice(post.priceCents);
  const name = post.author.displayName ?? post.author.username;

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface" aria-label={`${POST_KINDS[post.kind].label} by ${name}`}>
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={`/profile/${post.author.username}`} aria-hidden tabIndex={-1} className="vybe-gradient grid size-10 shrink-0 place-items-center rounded-full font-display font-extrabold text-ink">
          {name.slice(0, 1).toUpperCase()}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/profile/${post.author.username}`} className="truncate font-bold hover:underline">
              {name}
            </Link>
            {post.author.teamTitle && <TeamBadge title={post.author.teamTitle} />}
            {post.author.creatorType && <CreatorBadge type={post.author.creatorType} />}
          </div>
          <p className="truncate text-xs text-muted">
            <span className={`font-semibold ${KIND_TONE[post.kind]}`}>{POST_KINDS[post.kind].label}</span>
            {post.business && (
              <>
                {" · "}
                <Link href={`/venue/${post.business.slug}`} className="hover:text-text hover:underline">
                  {post.business.name}
                </Link>
              </>
            )}
            {" · "}
            <time dateTime={post.createdAt}>{timeAgo(new Date(post.createdAt))}</time>
          </p>
        </div>
        {post.isAlcoholic && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-bold text-muted" title="Alcohol: shown to members 21+">21+</span>}
        {post.isDemo && <DemoBadge label="Demo" />}
      </header>

      {post.photos.length > 0 && (
        <div className="relative">
          <ul className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]" aria-label={`${post.photos.length} photo${post.photos.length > 1 ? "s" : ""}`}>
            {post.photos.map((ph, i) => (
              <li key={ph.src} className="relative aspect-square w-full shrink-0 snap-center bg-ink">
                <Image
                  src={ph.src}
                  alt={ph.alt}
                  fill
                  sizes="(min-width: 768px) 600px, 100vw"
                  className="object-cover"
                  priority={priority && i === 0}
                  unoptimized={!ph.src.startsWith("/")}
                />
              </li>
            ))}
          </ul>
          {post.photos.length > 1 && (
            <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-semibold">1/{post.photos.length}</span>
          )}
          {rating && (
            <span className="absolute bottom-3 left-3 rounded-full bg-ink/80 px-3 py-1 font-display text-sm font-extrabold backdrop-blur">
              <span className="vybe-text">{rating}</span> <span className="text-[10px] font-bold tracking-widest text-muted">VYBR8</span>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
        <div className="flex items-center gap-1">
          <VybeButton postId={post.id} vybed={post.viewerVybed} count={post.vybeCount} signedIn={signedIn} />
          <Link href={`/post/${post.id}#comments`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm text-muted hover:text-text" aria-label={`${post.commentCount} comments`}>
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
            </svg>
            {post.commentCount}
          </Link>
          {price && <span className="ml-auto text-sm font-semibold text-muted tabular-nums">{price}</span>}
        </div>
        {post.itemName && <p className="font-display font-bold">{post.itemName}</p>}
        {post.caption && <p className="whitespace-pre-line text-sm text-muted">{post.caption}</p>}
      </div>
    </article>
  );
}
