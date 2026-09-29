import Image from "next/image";
import Link from "next/link";
import type { FeedPost } from "@/domain/posts/feed-types";
import { formatRating } from "@/domain/posts/posts";

/** Instagram-style square grid for profiles, venues and Explore. */
export function PostGrid({ posts, empty }: { posts: FeedPost[]; empty: React.ReactNode }) {
  if (!posts.length) return <div className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-muted">{empty}</div>;
  return (
    <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {posts.map((p) => {
        const cover = p.photos[0];
        const rating = formatRating(p.rating);
        return (
          <li key={p.id} className="relative aspect-square bg-surface">
            <Link href={`/post/${p.id}`} className="group block size-full" aria-label={`${p.itemName ?? p.business?.name ?? "Post"} by ${p.author.displayName ?? p.author.username}`}>
              {cover && (
                <Image src={cover.src} alt={cover.alt} fill sizes="(min-width: 768px) 300px, 33vw" className="object-cover transition group-hover:opacity-85" unoptimized={!cover.src.startsWith("/")} />
              )}
              {rating && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/80 px-2 py-0.5 font-display text-xs font-extrabold">
                  <span className="vybe-text">{rating}</span>
                </span>
              )}
              {p.photos.length > 1 && (
                <svg viewBox="0 0 24 24" aria-hidden className="absolute right-2 top-2 size-4 fill-text drop-shadow">
                  <path d="M7 3h14v14h-2V5H7z" /><path d="M3 7h14v14H3z" />
                </svg>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
