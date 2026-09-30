import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireAdmin } from "@/server/auth";
import { Avatar } from "@/components/ui/Avatar";
import { answerJoinRequest, removeTeamMember, setTeamMember } from "./actions";

export const metadata = { title: "VYBR8 Team manager" };

const field = "min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm";
const ROLES = [
  { key: "moderator", label: "Moderator", line: "Support inbox, moderation, creator queue, reviewing hours, badges and closed places" },
  { key: "admin", label: "Admin", line: "Everything a moderator can do, plus claims, importing places and the Admin page" },
] as const;

type Search = { searchParams: Promise<{ e?: string; saved?: string; removed?: string; declined?: string }> };
type JoinRequest = { ticket_id: string; user_id: string | null; username: string | null; display_name: string | null; avatar_url: string | null; email: string; message: string; created_at: string; on_team: boolean };

export default async function TeamManager({ searchParams }: Search) {
  let viewerId: string;
  try {
    viewerId = (await requireAdmin()).id;
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }
  const supabase = await createClient();
  const { data: me } = await supabase.from("team_members").select("is_founder").eq("user_id", viewerId).maybeSingle();
  if (!(me as { is_founder: boolean } | null)?.is_founder) notFound();   // only the founder manages the team
  const sp = await searchParams;
  const [{ data }, { data: reqData }] = await Promise.all([supabase.rpc("team_roster"), supabase.rpc("team_join_requests")]);
  const requests = (reqData ?? []) as JoinRequest[];
  const roster = (data ?? []) as { user_id: string; username: string; display_name: string | null; title: string; role: string | null; is_founder: boolean }[];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted hover:text-text">← Admin</Link>
      <header>
        <h1 className="text-3xl font-bold">VYBR8 Team</h1>
        <p className="text-sm text-muted">Add people who help run VYBR8. They sign up at vybr8.live like anyone else, then you add them here by their username.</p>
      </header>

      {sp.e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{sp.e}</p>}
      {sp.saved && <p role="status" className="rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">@{sp.saved} is on the team. They got a welcome alert, and their team tools are on their profile.</p>}
      {sp.removed && <p role="status" className="rounded-xl border border-line p-3 text-sm">Removed from the team. Their badge and team access are gone.</p>}
      {sp.declined && <p role="status" className="rounded-xl border border-line p-3 text-sm">Request declined. They got a kind note thanking them.</p>}

      <section aria-labelledby="req-h" className="flex flex-col gap-3">
        <h2 id="req-h" className="text-lg font-bold">Requests to join {requests.length > 0 && <span className="ml-1 rounded-full bg-coral px-2 py-0.5 text-xs text-ink">{requests.length}</span>}</h2>
        {requests.length ? (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => {
              const who = r.display_name ?? r.username ?? r.email;
              return (
                <li key={r.ticket_id} className="flex flex-col gap-3 rounded-2xl border border-coral/40 bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <Avatar path={r.avatar_url} name={who} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {r.username ? <Link href={`/profile/${r.username}`} className="hover:underline">{who}</Link> : who}
                        {r.username && <span className="font-normal text-muted"> @{r.username}</span>}
                      </p>
                      <p className="text-xs text-faint">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {r.email}</p>
                      <p className="mt-2 whitespace-pre-line text-sm">{r.message}</p>
                      {r.on_team && <p className="mt-1 text-xs text-mint">Already on the team. Accepting updates their role and title.</p>}
                    </div>
                  </div>
                  {r.username ? (
                    <form action={answerJoinRequest} className="flex flex-col gap-2 border-t border-line pt-3">
                      <input type="hidden" name="ticket" value={r.ticket_id} />
                      <input type="hidden" name="username" value={r.username} />
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <label className="flex flex-col gap-1 text-xs font-semibold">Title on their badge
                          <input name="title" maxLength={60} defaultValue="VYBR8 Team" className={field} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold">Role
                          <select name="role" defaultValue="moderator" className={field}>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button name="decision" value="accept" className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-bold text-ink">Accept &amp; add to team</button>
                        <button name="decision" value="decline" formNoValidate className="min-h-11 rounded-full border border-line px-5 text-sm font-bold text-muted hover:text-text">Decline</button>
                      </div>
                    </form>
                  ) : (
                    <form action={answerJoinRequest} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <input type="hidden" name="ticket" value={r.ticket_id} />
                      <p className="flex-1 text-xs text-muted">They wrote in without a VYBR8 account. Email them to sign up, then add them by username below.</p>
                      <button name="decision" value="decline" className="min-h-9 rounded-full border border-line px-4 text-xs font-bold text-muted hover:text-text">Close request</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No requests right now. People can ask to join from Help &amp; Support (&ldquo;I want to join the VYBR8 Team&rdquo;).</p>
        )}
      </section>

      <section aria-labelledby="add-h" className="flex flex-col gap-3 rounded-2xl border border-mint/40 bg-surface p-5">
        <h2 id="add-h" className="text-lg font-bold">Add someone (or change their role)</h2>
        <form action={setTeamMember} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">Their VYBR8 username
              <input name="username" required maxLength={40} placeholder="@username" autoComplete="off" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Title on their badge
              <input name="title" required maxLength={60} placeholder="Community Team, Head of Partnerships…" className={field} />
            </label>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Role</legend>
            {ROLES.map((r, i) => (
              <label key={r.key} className="flex cursor-pointer flex-col rounded-xl border border-line p-3 has-[:checked]:border-mint has-[:checked]:bg-mint/10">
                <span className="flex items-center gap-2 font-bold"><input type="radio" name="role" value={r.key} defaultChecked={i === 0} className="accent-[var(--color-mint)]" />{r.label}</span>
                <span className="text-xs text-muted">{r.line}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">Short bio for the team page <span className="font-normal text-faint">(optional)</span>
            <input name="bio" maxLength={280} placeholder="Keeps the timeline tasty and honest." className={field} />
          </label>
          <button className="vybe-gradient min-h-11 self-start rounded-full px-6 text-sm font-bold text-ink">Add to the team</button>
        </form>
        <p className="text-xs text-faint">Start new people as Moderators. Admins can see claims, ID documents and the whole Admin page, so give that only to people you fully trust.</p>
      </section>

      <section aria-labelledby="roster-h" className="flex flex-col gap-2">
        <h2 id="roster-h" className="text-lg font-bold">The team ({roster.length})</h2>
        <ul className="flex flex-col gap-2">
          {roster.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="min-w-0">
                <p className="font-bold"><Link href={`/profile/${m.username}`} className="hover:underline">{m.display_name ?? m.username}</Link> <span className="font-normal text-muted">@{m.username}</span></p>
                <p className="text-xs text-muted">{m.title} · {m.is_founder ? "Founder" : m.role ? m.role.replace("admin", "Admin").replace("moderator", "Moderator") : "No team access"}</p>
              </div>
              {!m.is_founder && (
                <details className="text-sm">
                  <summary className="cursor-pointer list-none rounded-full border border-line px-4 py-2 font-bold text-muted hover:text-text">Remove</summary>
                  <form action={removeTeamMember} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="user" value={m.user_id} />
                    <span className="text-xs text-muted">Remove @{m.username}?</span>
                    <button className="rounded-full border border-danger/60 px-3 py-1.5 text-xs font-bold text-danger">Yes, remove</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-faint">To change someone&rsquo;s role or title, add them again above with the new details.</p>
      </section>
    </main>
  );
}
