import { Avatar } from "@/components/ui/Avatar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorBadge, TeamBadge } from "@/components/posts/Badges";
import { PostButton } from "@/components/posts/PostButton";
import { PostGrid } from "@/components/posts/PostGrid";
import { CreatorQueue } from "@/components/team/CreatorQueue";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBadge";
import type { CreatorType } from "@/domain/posts/posts";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getFeed } from "@/server/posts";
import { getPendingApplications } from "@/server/team";
import { follow, unfollow } from "../actions";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: Params) {
  const { username } = await params;
  const supabase = await createClient();
  const viewer = await getViewer();

  // RLS decides visibility: a private or friends-only profile simply returns no row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, home_city, home_region, is_demo, avatar_url")
    .eq("username", username)
    .maybeSingle();
  if (!profile) notFound();

  const id = profile.id as string;
  const isMe = viewer?.id === id;
  const isStaff = !!viewer?.platformRoles.length;

  const [creator, team, followers, following, iFollow, myApplication, page, idCheck] = await Promise.all([
    supabase.from("creator_profiles").select("creator_type, status").eq("user_id", id).maybeSingle(),
    supabase.from("team_members").select("title, bio").eq("user_id", id).maybeSingle(),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", id),
    viewer && !isMe ? supabase.from("follows").select("followee_id").eq("follower_id", viewer.id).eq("followee_id", id).maybeSingle() : Promise.resolve({ data: null }),
    isMe ? supabase.from("creator_applications").select("status").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    getFeed({ kind: "author", authorId: id }),
    supabase.rpc("identity_verified", { p_users: [id] }),
  ]);
  const idVerified = ((idCheck.data ?? []) as unknown[]).length > 0;

  const creatorType = creator.data?.status === "verified" ? (creator.data.creator_type as CreatorType) : null;
  const teamTitle = (team.data?.title as string | undefined) ?? null;
  const name = (profile.display_name as string | null) ?? (profile.username as string);
  const showTeamTools = isMe && isStaff;
  const pending = showTeamTools ? await getPendingApplications(3) : null;

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar path={profile.avatar_url as string | null} name={name} size="xl" verified={idVerified} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            {teamTitle && <TeamBadge title={teamTitle} size="md" />}
            {creatorType && <CreatorBadge type={creatorType} size="md" />}
            {idVerified && <span className="rounded-full border border-sky/50 px-2 py-0.5 text-xs font-bold text-sky">ID verified</span>}
            {profile.is_demo && <DemoBadge label="Demo profile" />}
          </div>
          <p className="text-sm text-muted">
            @{profile.username as string}
            {profile.home_city && ` · ${profile.home_city}${profile.home_region ? `, ${profile.home_region}` : ""}`}
          </p>
          <dl className="flex gap-5 text-sm">
            <div><dt className="sr-only">Posts</dt><dd><b className="tabular-nums">{page.posts.length}{page.nextCursor ? "+" : ""}</b> <span className="text-muted">posts</span></dd></div>
            <div><dt className="sr-only">Followers</dt><dd><b className="tabular-nums">{followers.count ?? 0}</b> <span className="text-muted">followers</span></dd></div>
            <div><dt className="sr-only">Following</dt><dd><b className="tabular-nums">{following.count ?? 0}</b> <span className="text-muted">following</span></dd></div>
          </dl>
        </div>
      </header>

      {(team.data?.bio || profile.bio) && <p className="max-w-prose text-muted">{(team.data?.bio as string) || (profile.bio as string)}</p>}

      <div className="flex flex-wrap gap-3">
        {isMe ? (
          <>
            <PostButton />
            <Link href="/groups" className="vybe-ring inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold">Groups &amp; Family</Link>
            <Link href="/profile/settings" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Edit profile &amp; privacy</Link>
            <form action="/auth/sign-out" method="post"><button className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-muted hover:text-text">Sign out</button></form>
          </>
        ) : viewer ? (
          <form action={iFollow.data ? unfollow : follow}>
            <input type="hidden" name="userId" value={id} />
            <input type="hidden" name="username" value={profile.username as string} />
            <Button type="submit" variant={iFollow.data ? "ghost" : "primary"}>{iFollow.data ? "Following" : "Follow"}</Button>
          </form>
        ) : (
          <Link href={`/auth/sign-in?next=/profile/${profile.username}`} className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-ink">Follow</Link>
        )}
      </div>

      {isMe && !creatorType && (
        <section className="rounded-[var(--radius-card)] vybe-ring flex flex-col gap-2 p-5">
          <h2 className="text-lg font-bold">Big Back or Liquid Lover?</h2>
          {myApplication.data?.status === "pending" ? (
            <p className="text-sm text-muted">Your creator application is with the VYBR8 team. We&rsquo;ll let you know once it&rsquo;s reviewed.</p>
          ) : (
            <>
              <p className="text-sm text-muted">Verified creators get a badge and show up on Explore and in everyone&rsquo;s Creators timeline.</p>
              <Link href="/creators/apply" className="self-start text-sm font-bold text-sky hover:underline">Apply to be a verified creator</Link>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="posts-h" className="flex flex-col gap-3">
        <h2 id="posts-h" className="text-lg font-bold">Plates &amp; Pours</h2>
        <PostGrid posts={page.posts} empty={isMe ? <>Your posts show up here. <Link href="/post/new" className="font-semibold text-sky">Post your first plate</Link></> : "No posts yet."} />
      </section>

      {showTeamTools && pending && (
        <section aria-labelledby="team-h" className="flex flex-col gap-4 border-t border-line pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="team-h" className="text-xl font-bold">VYBR8 Team · Creator verification</h2>
            <Link href="/team/creators" className="text-sm font-semibold text-sky hover:underline">Open full queue ({pending.total})</Link>
          </div>
          <p className="text-sm text-muted">Only the VYBR8 team sees this section. Approving gives the person a verified Big Back or Liquid Lover badge and features their posts on Explore.</p>
          <CreatorQueue applications={pending.items} returnTo={`/profile/${profile.username}`} />
        </section>
      )}
    </article>
  );
}
