import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupChat } from "@/components/linkups/GroupChat";
import { GuestLinkMaker } from "@/components/linkups/GuestLinkMaker";
import { Avatar } from "@/components/ui/Avatar";
import { OCCASIONS, formatWhen } from "@/domain/linkups/linkups";
import { requireViewer } from "@/server/auth";
import { getInvitableFriends, getLinkup, toChat } from "@/server/linkups";
import { createClient } from "@/lib/supabase/server";
import {
  approveRequest, cancelLinkup, createGuestLink, inviteFriend, joinLinkup, leaveLinkup, loadChat, removeMember, revokeGuestInvite, sendChat,
} from "../actions";

export const metadata = { title: "Link Up" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> };

const small = "min-h-9 rounded-full px-3 text-xs font-bold";

export default async function LinkupPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer(`/vybe/${id}`);
  const l = await getLinkup(id, viewer);
  if (!l) notFound();

  const supabase = await createClient();
  const { data: meRow } = await supabase.from("profiles").select("avatar_url").eq("id", viewer.id).single();
  const hasPhoto = !!meRow?.avatar_url;
  const [friends, chat] = await Promise.all([
    l.isHost && !l.isOver ? getInvitableFriends(viewer, id) : Promise.resolve([]),
    l.canChat ? supabase.rpc("linkup_chat", { p_linkup: id }).then((r) => toChat(r.data)) : Promise.resolve([]),
  ]);
  const going = l.members.filter((m) => m.status === "going");
  const requests = l.members.filter((m) => m.status === "requested");
  const invited = l.members.filter((m) => m.status === "invited");
  const guestsGoing = l.guests.filter((g) => g.status === "accepted");
  const full = l.spotsLeft === 0;
  const ends = formatWhen(new Date(l.endsAt), l.timezone).split(" · ")[1];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link href="/vybe" className="text-sm font-semibold text-muted hover:text-text">← Link Ups</Link>

      {isNew && (
        <p role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm">
          Your Link Up is live. Invite friends below, or make a guest link for anyone who isn&rsquo;t on VYBR8 yet.
        </p>
      )}

      <header className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-coral">{OCCASIONS[l.occasion]}{l.isAlcoholic ? " · 21+" : ""}</span>
        <h1 className="text-3xl font-extrabold leading-tight">{l.title}</h1>
        <p className="text-muted">
          {l.when} – {ends} · {l.cityName}
          {l.business ? <> · <Link href={`/venue/${l.business.slug}`} className="font-semibold text-sky">{l.business.name}</Link></> : l.place ? ` · ${l.place}` : ""}
        </p>
        {l.business?.address && <p className="text-sm text-faint">{l.business.address}</p>}
        {l.description && <p className="whitespace-pre-line">{l.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-3 py-1 font-bold ${full ? "bg-surface-2 text-faint" : "vybe-gradient text-ink"}`}>{full ? "Full" : `${l.spotsLeft} of ${l.capacity} spots left`}</span>
          <Link href={`/profile/${l.host.username}`} className="flex items-center gap-2 text-faint"><Avatar path={l.host.avatarUrl} name={l.host.name} size="sm" /> Hosted by <span className="text-text">{l.host.name}</span></Link>
          {l.openToNewFriends && <span className="text-sky">· Open to new friends</span>}
        </div>
      </header>

      {l.status === "cancelled" && <p className="rounded-xl border border-danger/50 p-3 text-sm text-danger">This Link Up was cancelled.</p>}
      {l.status === "active" && l.isOver && <p className="rounded-xl border border-line p-3 text-sm text-muted">This Link Up has ended, and its group chat is gone.</p>}

      {!l.isOver && !l.isHost && !hasPhoto && (l.myStatus === null || l.myStatus === "invited") && (
        <p className="rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm">
          Add a profile photo to join, so the group knows who&rsquo;s coming. <Link href="/profile/settings" className="font-semibold text-sky">Add a photo</Link>
        </p>
      )}

      {!l.isOver && !l.isHost && (hasPhoto || l.myStatus === "going" || l.myStatus === "requested") && (
        <div className="flex flex-wrap gap-2">
          {(l.myStatus === null || l.myStatus === "invited") && !full && (
            <form action={joinLinkup}>
              <input type="hidden" name="linkup" value={l.id} />
              <button className="vybe-gradient min-h-11 rounded-full px-6 text-sm font-bold text-ink">
                {l.myStatus === "invited" ? "Accept invite" : l.joinMode === "request" ? "Ask to join" : "Join"}
              </button>
            </form>
          )}
          {l.myStatus === null && full && <p className="text-sm text-muted">This Link Up is full.</p>}
          {l.myStatus === "requested" && <p className="self-center text-sm text-sky">Request sent. The host will let you know.</p>}
          {l.myStatus && (
            <form action={leaveLinkup}>
              <input type="hidden" name="linkup" value={l.id} />
              <button className="min-h-11 rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">
                {l.myStatus === "invited" ? "Decline" : l.myStatus === "requested" ? "Cancel request" : "Leave"}
              </button>
            </form>
          )}
        </div>
      )}

      <section aria-labelledby="who-h" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h2 id="who-h" className="text-lg font-bold">Who&rsquo;s going ({going.length + guestsGoing.length}/{l.capacity})</h2>
        <ul className="flex flex-col gap-2">
          {going.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2">
              <Link href={`/profile/${m.username}`} className="flex items-center gap-3 font-semibold">
                <Avatar path={m.avatarUrl} name={m.name} size="md" />
                <span>{m.name}{m.isHost ? <span className="ml-2 text-xs text-coral">Host</span> : null}</span>
              </Link>
              {l.isHost && !m.isHost && !l.isOver && (
                <form action={removeMember}>
                  <input type="hidden" name="linkup" value={l.id} /><input type="hidden" name="user" value={m.userId} />
                  <button className={`${small} text-muted hover:text-danger`}>Remove</button>
                </form>
              )}
            </li>
          ))}
          {guestsGoing.map((g) => (
            <li key={g.id} className="flex items-center gap-3 font-semibold">
              <Avatar name={g.guestName ?? "Guest"} size="md" ring={false} />
              <span>{g.guestName} <span className="text-xs font-normal text-faint">guest · not on VYBR8 yet</span></span>
            </li>
          ))}
        </ul>

        {l.isHost && requests.length > 0 && (
          <>
            <h3 className="mt-2 text-sm font-bold text-sky">Asking to join</h3>
            <ul className="flex flex-col gap-2">
              {requests.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2">
                  <Link href={`/profile/${m.username}`} className="flex items-center gap-3 font-semibold"><Avatar path={m.avatarUrl} name={m.name} size="md" />{m.name}</Link>
                  <span className="flex gap-1">
                    {[{ a: "1", t: "Approve", c: "vybe-gradient text-ink" }, { a: "0", t: "Decline", c: "border border-line" }].map((b) => (
                      <form key={b.a} action={approveRequest}>
                        <input type="hidden" name="linkup" value={l.id} /><input type="hidden" name="user" value={m.userId} /><input type="hidden" name="approve" value={b.a} />
                        <button disabled={b.a === "1" && full} className={`${small} ${b.c} disabled:opacity-40`}>{b.t}</button>
                      </form>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {l.isHost && invited.length > 0 && <p className="text-xs text-faint">Invited: {invited.map((m) => m.name).join(", ")}</p>}
      </section>

      {l.canChat && (
        <GroupChat
          initial={chat}
          load={loadChat.bind(null, l.id)}
          send={sendChat.bind(null, l.id)}
          realtimeLinkupId={l.id}
          endsAt={l.endsAt}
          timezone={l.timezone}
        />
      )}
      {!l.canChat && !l.isOver && l.myStatus !== "going" && (
        <p className="text-sm text-faint">The group chat opens once you&rsquo;re going.</p>
      )}

      {l.isHost && !l.isOver && (
        <section aria-labelledby="invite-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 id="invite-h" className="text-lg font-bold">Invite people</h2>
          {friends.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {friends.map((f) => (
                <li key={f.id}>
                  <form action={inviteFriend}>
                    <input type="hidden" name="linkup" value={l.id} /><input type="hidden" name="user" value={f.id} />
                    <button className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold hover:bg-surface-2">+ {f.name}</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No more friends to invite. <Link href="/friends" className="text-sky">Find friends</Link></p>
          )}

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="font-bold">Invite someone who isn&rsquo;t on VYBR8</h3>
            <p className="text-sm text-muted">They get a private link to see the details, RSVP and join the group chat as a guest. No account needed.</p>
            <GuestLinkMaker create={createGuestLink.bind(null, l.id)} title={l.title} />
            {l.guests.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {l.guests.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span>{g.guestName ?? g.label ?? "Guest link"} <span className="text-xs text-faint">· {g.status === "pending" ? "not answered yet" : g.status}</span></span>
                    {g.status !== "declined" && (
                      <form action={revokeGuestInvite}>
                        <input type="hidden" name="linkup" value={l.id} /><input type="hidden" name="invite" value={g.id} />
                        <button className={`${small} text-muted hover:text-danger`}>{g.status === "accepted" ? "Remove" : "Turn off link"}</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={cancelLinkup} className="border-t border-line pt-4">
            <input type="hidden" name="linkup" value={l.id} />
            <button className="min-h-10 rounded-full border border-danger/50 px-4 text-sm font-bold text-danger hover:bg-danger/10">Cancel this Link Up</button>
          </form>
        </section>
      )}
    </div>
  );
}
