import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkUpHere } from "@/components/linkups/LinkUpHere";
import { ShareButton } from "@/components/share/ShareButton";
import { PostCard } from "@/components/posts/PostCard";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/domain/posts/posts";
import { getViewer } from "@/server/auth";
import { getComments, getPost } from "@/server/posts";
import { addComment, deletePost, reportContent } from "../actions";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ reported?: string }> };

export async function generateMetadata({ params }: Params) {
  const post = await getPost((await params).id);
  return { title: post ? (post.itemName ?? post.business?.name ?? "Post") : "Post" };
}

const REASONS = [
  ["not_food_or_drink", "Not food, drinks or a place"],
  ["misleading", "Misleading or fake"],
  ["spam", "Spam"],
  ["inappropriate", "Inappropriate"],
  ["harassment", "Harassment"],
  ["underage_drinking", "Underage drinking"],
  ["other", "Something else"],
] as const;

export default async function PostPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { reported } = await searchParams;
  const [post, viewer] = await Promise.all([getPost(id), getViewer()]);
  if (!post) notFound();
  const comments = await getComments(id);
  const isAuthor = viewer?.id === post.author.id;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PostCard post={post} signedIn={!!viewer} priority />
      <div className="flex flex-wrap gap-2">
        <ShareButton path={`/post/${post.id}`} title={post.business ? `This from ${post.business.name}` : "This on VYBR8"} text={post.business ? `Look at this from ${post.business.name} on VYBR8` : "Look at this on VYBR8"} />
        {post.business && <LinkUpHere venueSlug={post.business.slug} signedIn={!!viewer} isAdult={viewer?.isAdult ?? false} />}
        {post.business && <Link href={`/venue/${post.business.slug}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-sky hover:bg-surface-2">See {post.business.name}</Link>}
      </div>

      <section id="comments" aria-labelledby="comments-h" className="flex flex-col gap-3">
        <h2 id="comments-h" className="text-lg font-bold">Comments ({comments.length})</h2>
        {comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <a href={`/profile/${c.author?.username}`} className="font-bold hover:underline">{c.author?.display_name ?? c.author?.username}</a>{" "}
              <span className="text-muted">{c.body}</span>{" "}
              <time className="text-xs text-faint" dateTime={c.createdAt}>{timeAgo(new Date(c.createdAt))}</time>
            </li>
          ))}
        </ul>
        {viewer ? (
          <form action={addComment} className="flex gap-2">
            <input type="hidden" name="postId" value={post.id} />
            <label htmlFor="body" className="sr-only">Add a comment</label>
            <input id="body" name="body" required maxLength={1000} placeholder="Add a comment" className="min-h-11 flex-1 rounded-full border border-line bg-surface px-4 text-sm" />
            <Button type="submit" variant="ghost">Post</Button>
          </form>
        ) : (
          <a href={`/auth/sign-in?next=/post/${post.id}`} className="text-sm font-semibold text-sky">Sign in to comment</a>
        )}
      </section>

      {viewer && (
        <section className="flex flex-col gap-3 border-t border-line pt-4">
          {isAuthor ? (
            <form action={deletePost}>
              <input type="hidden" name="postId" value={post.id} />
              <Button type="submit" variant="danger">Delete post</Button>
            </form>
          ) : reported ? (
            <p className="text-sm text-mint">Thanks. The VYBR8 team will review this post.</p>
          ) : (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-text">Report this post</summary>
              <form action={reportContent} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="targetId" value={post.id} />
                <input type="hidden" name="targetType" value="post" />
                <label htmlFor="reason" className="font-semibold">What&rsquo;s wrong?</label>
                <select id="reason" name="reason" className="min-h-11 rounded-xl border border-line bg-surface px-3">
                  {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <label htmlFor="note" className="sr-only">Details</label>
                <input id="note" name="note" maxLength={500} placeholder="Details (optional)" className="min-h-11 rounded-xl border border-line bg-surface px-3" />
                <Button type="submit" variant="ghost" className="self-start">Send report</Button>
              </form>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
