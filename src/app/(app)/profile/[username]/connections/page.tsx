import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { PAGE_SIZE, getConnections, type ConnectionTab } from "@/server/connections";
import { follow, unfollow } from "../../actions";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string; page?: string }> };

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `@${username} · Followers` };
}

export default async function ConnectionsPage({ params, searchParams }: Props) {
  const { username } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id, username, display_name").eq("username", username).maybeSingle();
  if (!profile) notFound();

  const viewer = await getViewer();
  const id = profile.id as string;
  const handle = profile.username as string;
  const isMe = viewer?.id === id;
  const canMutual = !!viewer && !isMe;
  const tab: ConnectionTab = sp.tab === "following" ? "following" : sp.tab === "mutual" && canMutual ? "mutual" : "followers";
  const page = Math.max(0, Math.min(200, Number(sp.page) || 0));

  const [list, followers, following, mutual] = await Promise.all([
    getConnections(id, tab, page * PAGE_SIZE),
    getConnections(id, "followers", 0, 1),
    getConnections(id, "following", 0, 1),
    canMutual ? getConnections(id, "mutual", 0, 1) : Promise.resolve({ total: 0, people: [] }),
  ]);
  const tabs: { key: ConnectionTab; label: string; n: number }[] = [
    { key: "followers", label: "Followers", n: followers.total },
    { key: "following", label: "Following", n: following.total },
    ...(canMutual ? [{ key: "mutual" as const, label: "Mutuals", n: mutual.total }] : []),
  ];
  const back = `/profile/${handle}/connections`;
  const name = (profile.display_name as string | null) ?? handle;
  const empty = {
    followers: isMe ? "No followers yet. Share your profile so friends can find you." : `No one follows ${name} yet.`,
    following: isMe ? "You're not following anyone yet." : `${name} isn't following anyone yet.`,
    mutual: `No one you follow follows ${name} yet.`,
  }[tab];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <Link href={`/profile/${handle}`} className="text-sm text-muted hover:text-text">← {name}</Link>
      <h1 className="text-2xl font-bold">{name} <span className="text-base font-normal text-muted">@{handle}</span></h1>

      <nav aria-label="Connections" className="grid auto-cols-fr grid-flow-col rounded-full border border-line p-1">
        {tabs.map((t) => (
          <Link key={t.key} href={`${back}?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}
            className={`min-h-10 rounded-full px-3 py-2 text-center text-sm font-bold ${t.key === tab ? "vybe-gradient text-ink" : "text-muted hover:text-text"}`}>
            {t.label} <span className="tabular-nums opacity-80">{t.n}</span>
          </Link>
        ))}
      </nav>
      {tab === "mutual" && <p className="-mt-2 text-xs text-faint">People you follow who also follow {name}.</p>}

      {list.people.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.people.map((p) => {
            const pName = p.displayName ?? p.username;
            const self = viewer?.id === p.id;
            return (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <Link href={`/profile/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar path={p.avatarPath} name={pName} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{pName}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      @{p.username}
                      {p.followsMe && !self && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-text">Follows you</span>}
                    </span>
                  </span>
                </Link>
                {viewer && !self && (
                  <form action={p.iFollow ? unfollow : follow}>
                    <input type="hidden" name="userId" value={p.id} />
                    <input type="hidden" name="username" value={p.username} />
                    <input type="hidden" name="back" value={back} />
                    <button className={`min-h-9 rounded-full px-4 text-xs font-bold ${p.iFollow ? "border border-line text-muted hover:text-text" : "vybe-gradient text-ink"}`}>
                      {p.iFollow ? "Following" : p.followsMe ? "Follow back" : "Follow"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{empty}</p>
      )}

      {(page > 0 || (page + 1) * PAGE_SIZE < list.total) && (
        <div className="flex justify-between text-sm font-semibold">
          {page > 0 ? <Link href={`${back}?tab=${tab}&page=${page - 1}`} className="text-sky">← Newer</Link> : <span />}
          {(page + 1) * PAGE_SIZE < list.total && <Link href={`${back}?tab=${tab}&page=${page + 1}`} className="text-sky">More →</Link>}
        </div>
      )}
      {!viewer && <p className="text-center text-sm text-muted"><Link href={`/auth/sign-in?next=${back}`} className="font-semibold text-sky">Sign in</Link> to follow people and see mutuals.</p>}
    </div>
  );
}
