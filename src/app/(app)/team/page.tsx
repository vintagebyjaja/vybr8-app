import Link from "next/link";
import { TeamBadge } from "@/components/posts/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";

export const metadata = { title: "VYBR8 Team" };

type Member = { title: string; bio: string | null; position: number; is_founder: boolean; user_id: string; profile: { username: string; display_name: string | null; avatar_url: string | null } | null };

export default async function TeamPage() {
  const supabase = await createClient();
  const [viewer, { data }] = await Promise.all([
    getViewer(),
    supabase
      .from("team_members")
      .select("user_id, title, bio, position, is_founder, profile:profiles!team_members_user_id_fkey ( username, display_name, avatar_url )")
      .order("is_founder", { ascending: false })
      .order("position"),
  ]);
  const members = ((data ?? []) as unknown as Member[]).filter((m) => m.profile);
  const { data: verified } = members.length
    ? await supabase.rpc("identity_verified", { p_users: members.map((m) => m.user_id) })
    : { data: [] };
  const verifiedIds = new Set(((verified ?? []) as { user_id: string }[]).map((v) => v.user_id));
  const isTeam = !!viewer?.platformRoles.length;
  const nameOf = (m: Member) => m.profile!.display_name ?? m.profile!.username;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold">The VYBR8 <span className="vybe-text">Team</span></h1>
        <p className="mt-1 max-w-prose text-muted">The people who verify creators and keep VYBR8 tasty, honest and safe. Tap anyone to see their profile.</p>
      </header>

      {members.length > 0 ? (
        <>
          <ul aria-label="Team members" className="-mx-4 flex gap-5 overflow-x-auto px-4 pb-2">
            {members.map((m) => (
              <li key={m.user_id} className="shrink-0">
                <Link href={`/profile/${m.profile!.username}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
                  <Avatar path={m.profile!.avatar_url} name={nameOf(m)} size="lg" verified={verifiedIds.has(m.user_id)} />
                  <span className="w-full truncate text-xs font-semibold">{nameOf(m)}</span>
                  <span className={`w-full truncate text-[11px] ${m.is_founder ? "text-coral" : "text-faint"}`}>{m.title}</span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.user_id}>
                <Link href={`/profile/${m.profile!.username}`} className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 hover:bg-surface-2">
                  <Avatar path={m.profile!.avatar_url} name={nameOf(m)} size="lg" verified={verifiedIds.has(m.user_id)} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-bold">{nameOf(m)} <span className="font-normal text-faint">@{m.profile!.username}</span></span>
                    <TeamBadge title={m.title} />
                    {m.bio && <span className="text-sm text-muted">{m.bio}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-sm text-muted">
          The team roster will show here once the founder adds team members.
        </p>
      )}

      {isTeam && (
        <nav aria-label="Team tools" className="flex flex-wrap gap-3">
          <Link href="/team/creators" className="vybe-ring rounded-full px-5 py-2.5 text-sm font-bold">Creator verification →</Link>
          <Link href="/team/moderation" className="vybe-ring rounded-full px-5 py-2.5 text-sm font-bold">Reports &amp; removals →</Link>
        </nav>
      )}
    </div>
  );
}
