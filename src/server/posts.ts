import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FeedPage, FeedPost } from "@/domain/posts/feed-types";
import type { CreatorType, PostKind } from "@/domain/posts/posts";

/**
 * Read side for Plates, Pours and Spots. Every query runs as the viewer, so
 * Row Level Security decides what they can see (friends-only posts, private
 * profiles, blocks, moderation). Photos are served through short-lived signed URLs.
 */

const PAGE_SIZE = 18;
const SIGNED_URL_TTL = 60 * 60;
const BUCKET = "post-media";

const POST_SELECT = `
  id, kind, item_name, caption, rating, price_cents, visibility, status, is_alcoholic, is_demo, created_at, author_id,
  author:profiles!posts_author_id_fkey ( id, username, display_name ),
  business:businesses ( slug, name ),
  media:post_media ( storage_path, position, width, height, alt_text )
`;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = {
  id: string;
  kind: PostKind;
  item_name: string | null;
  caption: string | null;
  rating: string | number | null;
  price_cents: number | null;
  visibility: FeedPost["visibility"];
  status: FeedPost["status"];
  is_alcoholic: boolean;
  is_demo: boolean;
  created_at: string;
  author_id: string;
  author: { id: string; username: string; display_name: string | null } | null;
  business: { slug: string; name: string } | null;
  media: { storage_path: string; position: number; width: number | null; height: number | null; alt_text: string | null }[];
};

export type FeedQuery =
  | { kind: "following"; viewerId: string }
  | { kind: "creators"; postKind?: PostKind }
  | { kind: "recent"; postKind?: PostKind }
  | { kind: "author"; authorId: string }
  | { kind: "business"; businessId: string }
  | { kind: "businesses"; businessIds: string[] };

export async function getFeed(query: FeedQuery, cursor?: string | null): Promise<FeedPage> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const viewerId = (auth?.claims?.sub as string | undefined) ?? null;

  let q = supabase
    .from("posts")
    .select(POST_SELECT)
    .is("deleted_at", null)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (cursor) q = q.lt("created_at", cursor);

  switch (query.kind) {
    case "following": {
      const ids = await followingAuthorIds(supabase, query.viewerId);
      q = q.in("author_id", ids);
      break;
    }
    case "creators": {
      const ids = await verifiedCreatorIds(supabase);
      if (!ids.length) return { posts: [], nextCursor: null };
      q = q.in("author_id", ids);
      if (query.postKind) q = q.eq("kind", query.postKind);
      break;
    }
    case "recent":
      if (query.postKind) q = q.eq("kind", query.postKind);
      break;
    case "author":
      q = q.eq("author_id", query.authorId);
      break;
    case "business":
      q = q.eq("business_id", query.businessId);
      break;
    case "businesses":
      if (!query.businessIds.length) return { posts: [], nextCursor: null };
      q = q.in("business_id", query.businessIds);
      break;
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const page = rows.slice(0, PAGE_SIZE);
  return {
    posts: await hydrate(supabase, page, viewerId),
    nextCursor: rows.length > PAGE_SIZE ? (page.at(-1)?.created_at ?? null) : null,
  };
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const [post] = await hydrate(supabase, [data as unknown as Row], (auth?.claims?.sub as string | undefined) ?? null);
  return post ?? null;
}

export async function getComments(postId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_comments")
    .select("id, body, created_at, author:profiles!post_comments_author_id_fkey ( username, display_name )")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((c) => {
    const author = (Array.isArray(c.author) ? c.author[0] : c.author) as { username: string; display_name: string | null } | null;
    return { id: c.id as string, body: c.body as string, createdAt: c.created_at as string, author };
  });
}

// ── helpers ─────────────────────────────────────────────────────────────

async function followingAuthorIds(supabase: Supabase, viewerId: string): Promise<string[]> {
  const [{ data: follows }, { data: friends }] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", viewerId),
    supabase.from("friendships").select("requester_id, addressee_id").eq("status", "accepted"),
  ]);
  const ids = new Set<string>([viewerId]);
  for (const f of follows ?? []) ids.add(f.followee_id as string);
  for (const f of friends ?? []) ids.add((f.requester_id === viewerId ? f.addressee_id : f.requester_id) as string);
  return [...ids];
}

async function verifiedCreatorIds(supabase: Supabase): Promise<string[]> {
  // Fine at launch scale; move to a SQL view joined in the feed query when creators number in the thousands.
  const { data } = await supabase.from("creator_profiles").select("user_id").eq("status", "verified").limit(1000);
  return (data ?? []).map((r) => r.user_id as string);
}

async function hydrate(supabase: Supabase, rows: Row[], viewerId: string | null): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const postIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const storagePaths = rows.flatMap((r) => r.media.map((m) => m.storage_path)).filter((p) => !p.startsWith("demo/"));

  const [stats, creators, team, vybed, signed] = await Promise.all([
    supabase.from("post_stats").select("post_id, vybe_count, comment_count").in("post_id", postIds),
    supabase.from("creator_profiles").select("user_id, creator_type").in("user_id", authorIds).eq("status", "verified"),
    supabase.from("team_members").select("user_id, title").in("user_id", authorIds),
    viewerId
      ? supabase.from("post_vybes").select("post_id").eq("user_id", viewerId).in("post_id", postIds)
      : Promise.resolve({ data: [] as { post_id: string }[] }),
    storagePaths.length
      ? supabase.storage.from(BUCKET).createSignedUrls(storagePaths, SIGNED_URL_TTL)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);

  const statBy = new Map<string, { vybe_count?: number | string | null; comment_count?: number | string | null }>((stats.data ?? []).map((s) => [s.post_id as string, s]));
  const creatorBy = new Map<string, CreatorType>((creators.data ?? []).map((c) => [c.user_id as string, c.creator_type as CreatorType]));
  const teamBy = new Map<string, string>((team.data ?? []).map((t) => [t.user_id as string, t.title as string]));
  const vybedSet = new Set<string>((vybed.data ?? []).map((v) => v.post_id));
  const urlBy = new Map<string, string>((signed.data ?? []).filter((s) => s.path).map((s) => [s.path as string, s.signedUrl]));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    itemName: r.item_name,
    caption: r.caption,
    rating: r.rating === null ? null : Number(r.rating),
    priceCents: r.price_cents,
    visibility: r.visibility,
    status: r.status,
    isAlcoholic: r.is_alcoholic,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    author: {
      id: r.author_id,
      username: r.author?.username ?? "unknown",
      displayName: r.author?.display_name ?? null,
      creatorType: creatorBy.get(r.author_id) ?? null,
      teamTitle: teamBy.get(r.author_id) ?? null,
    },
    business: r.business,
    photos: [...r.media]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        src: m.storage_path.startsWith("demo/") ? `/${m.storage_path}` : (urlBy.get(m.storage_path) ?? ""),
        width: m.width ?? 1080,
        height: m.height ?? 1080,
        alt: m.alt_text ?? `${r.kind === "pour" ? "Drink" : r.kind === "spot" ? "Place" : "Dish"} photo${r.item_name ? `: ${r.item_name}` : ""}`,
      }))
      .filter((p) => p.src),
    vybeCount: Number(statBy.get(r.id)?.vybe_count ?? 0),
    commentCount: Number(statBy.get(r.id)?.comment_count ?? 0),
    viewerVybed: vybedSet.has(r.id),
  }));
}

/** Creators to feature on Explore, newest verified first. */
export async function getFeaturedCreators(limit = 12) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("creator_profiles")
    .select("creator_type, verified_at, profile:profiles!creator_profiles_user_id_fkey ( username, display_name )")
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((c) => {
      const p = (Array.isArray(c.profile) ? c.profile[0] : c.profile) as { username: string; display_name: string | null } | null;
      return p ? { username: p.username, displayName: p.display_name, creatorType: c.creator_type as CreatorType } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}
