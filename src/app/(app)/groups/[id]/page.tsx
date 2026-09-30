import Link from "next/link";
import { PlacePicker } from "@/components/places/PlacePicker";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { GROUP_KINDS, RELATIONSHIPS_FOR, RELATIONSHIP_LABEL, type Relationship } from "@/domain/groups/groups";
import { formatWhen } from "@/domain/linkups/linkups";
import { findCity } from "@/domain/map/map";
import { formatCents } from "@/domain/menus/menus";
import { requireViewer } from "@/server/auth";
import { getGroup, getGroupSuggestions, getMyKids } from "@/server/groups";
import { getMenu } from "@/server/menus";
import {
  addKid, addKidToGroup, addPick, createPlan, deleteGroup, inviteToGroup, leaveGroup, makeAdmin, removeMember, removePick, respondToInvite, setPlanStatus, setRelationship,
} from "../actions";

export const metadata = { title: "Group" };

const input = "min-h-10 rounded-xl border border-line bg-ink px-3 text-sm placeholder:text-faint";
const btn = "min-h-10 rounded-full px-4 text-sm font-bold";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; new?: string }> }) {
  const { id } = await params;
  const { e, new: isNew } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer(`/groups/${id}`);
  const g = await getGroup(id, viewer);
  if (!g) notFound();
  const city = findCity(g.citySlug);

  if (g.myStatus === "invited") {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-3xl font-extrabold">{g.name}</h1>
        <p className="text-muted">You&rsquo;re invited to this {GROUP_KINDS[g.kind].label.toLowerCase()} group.</p>
        <div className="flex gap-2">
          {[{ v: "1", l: "Join", c: "vybe-gradient text-ink" }, { v: "0", l: "Decline", c: "border border-line" }].map((b) => (
            <form key={b.v} action={respondToInvite}><input type="hidden" name="group" value={g.id} /><input type="hidden" name="accept" value={b.v} /><button className={`${btn} ${b.c}`}>{b.l}</button></form>
          ))}
        </div>
      </div>
    );
  }

  const manage = g.myRole === "owner" || g.myRole === "admin";
  const active = g.members.filter((m) => m.status === "active");
  const invited = g.members.filter((m) => m.status === "invited");
  const [suggestions, kids, menus] = await Promise.all([
    getGroupSuggestions(g, viewer),
    getMyKids(viewer),
    Promise.all(g.plans.filter((p) => p.business).map(async (p) => [p.id, await getMenu(p.business!.id, viewer.id)] as const)),
  ]);
  const menuBy = new Map(menus);
  const kidsNotIn = kids.filter((k) => !k.claimed && !g.members.some((m) => m.dependentId === k.id));
  const rels = RELATIONSHIPS_FOR[g.kind];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <Link href="/groups" className="text-sm font-semibold text-muted hover:text-text">← Groups</Link>
      <header className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-coral">{GROUP_KINDS[g.kind].label} · {city.name}</span>
        <h1 className="text-3xl font-extrabold">{g.name}</h1>
        {g.description && <p className="text-muted">{g.description}</p>}
      </header>
      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}
      {isNew && <p role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm">Group created. Invite people and add kids below, then plan your first outing.</p>}

      <section aria-labelledby="people-h" className="flex flex-col gap-3">
        <h2 id="people-h" className="text-xl font-bold">People ({active.length})</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((m) => (
            <li key={m.memberId} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Avatar path={m.isKid ? null : m.avatarUrl} name={m.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.username ? <Link href={`/profile/${m.username}`}>{m.name}</Link> : m.name}{m.userId === viewer.id && <span className="text-faint"> (you)</span>}</p>
                  <p className="text-xs text-muted">{RELATIONSHIP_LABEL[m.relationship]}{m.isKid ? " · kid profile" : ""}{m.role !== "member" ? ` · ${m.role}` : ""}</p>
                </div>
                {m.isKid && m.iAmGuardian && <Link href={`/groups/kids/${m.dependentId}`} className="text-xs font-semibold text-sky">Edit</Link>}
              </div>
              {m.taste.likes.length > 0 ? <p className="text-xs"><span className="text-faint">Loves</span> {m.taste.likes.slice(0, 5).join(", ")}</p> : <p className="text-xs text-faint">No tastes yet</p>}
              {m.taste.allergies.length > 0 && <p className="text-xs text-coral">Allergies: {m.taste.allergies.join(", ")}</p>}
              {m.taste.dislikes.length > 0 && <p className="text-xs text-faint">Won&rsquo;t eat: {m.taste.dislikes.join(", ")}</p>}
              {manage && m.role !== "owner" && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                  <form action={setRelationship} className="flex gap-1">
                    <input type="hidden" name="group" value={g.id} /><input type="hidden" name="member" value={m.memberId} />
                    <select name="relationship" defaultValue={m.relationship} aria-label="Relationship" className="min-h-9 rounded-lg border border-line bg-ink px-2 text-xs">
                      {[...new Set<Relationship>([...rels, m.relationship])].map((r) => <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>)}
                    </select>
                    <button className="min-h-9 rounded-full border border-line px-3 text-xs font-bold">Save</button>
                  </form>
                  {g.myRole === "owner" && !m.isKid && (
                    <form action={makeAdmin}><input type="hidden" name="group" value={g.id} /><input type="hidden" name="member" value={m.memberId} /><input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                      <button className="min-h-9 rounded-full border border-line px-3 text-xs font-bold">{m.role === "admin" ? "Remove admin" : "Make admin"}</button></form>
                  )}
                  <form action={removeMember}><input type="hidden" name="group" value={g.id} /><input type="hidden" name="member" value={m.memberId} />
                    <button className="min-h-9 rounded-full px-3 text-xs font-bold text-muted hover:text-danger">Remove</button></form>
                </div>
              )}
            </li>
          ))}
        </ul>
        {invited.length > 0 && <p className="text-sm text-faint">Waiting to accept: {invited.map((m) => m.name).join(", ")}</p>}

        {manage && (
          <div className="grid gap-3 md:grid-cols-2">
            <form action={inviteToGroup} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
              <b className="text-sm">Invite someone on VYBR8</b>
              <input type="hidden" name="group" value={g.id} />
              <input name="username" required placeholder="@username" aria-label="Username" className={input} />
              <select name="relationship" aria-label="Relationship" defaultValue={rels[0]} className={input}>{rels.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>)}</select>
              <p className="text-xs text-faint">They get an invite and have to accept.</p>
              <button className={`${btn} vybe-gradient self-start text-ink`}>Send invite</button>
            </form>
            {g.kind !== "dating" && (
              <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <b className="text-sm">Add a kid (no app needed)</b>
                {kidsNotIn.length > 0 && (
                  <form action={addKidToGroup} className="flex flex-wrap gap-2">
                    <input type="hidden" name="group" value={g.id} />
                    <select name="kid" aria-label="Kid" className={input}>{kidsNotIn.map((k) => <option key={k.id} value={k.id}>{k.firstName}</option>)}</select>
                    <button className={`${btn} border border-line`}>Add</button>
                  </form>
                )}
                <form action={addKid} className="flex flex-col gap-2">
                  <input type="hidden" name="group" value={g.id} /><input type="hidden" name="returnTo" value={`/groups/${g.id}`} />
                  <input name="first_name" required maxLength={40} placeholder="First name" aria-label="Kid's first name" className={input} />
                  <input name="likes" placeholder="Favorites: tenders, fries, lemonade" aria-label="Favorites" className={input} />
                  <input name="allergies" placeholder="Allergies (optional)" aria-label="Allergies" className={input} />
                  <button className={`${btn} border border-line self-start`}>Create kid profile</button>
                </form>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="sugg-h" className="flex flex-col gap-3">
        <h2 id="sugg-h" className="text-xl font-bold">VYBR8 picks for this group</h2>
        {suggestions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Add everyone&rsquo;s favorites (and kids&rsquo;) and VYBR8 will find places in {city.name} where everyone has something they&rsquo;ll love.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.businessId} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/venue/${s.businessSlug}`} className="font-display text-lg font-bold hover:underline">{s.businessName}</Link>
                  <span className={`text-xs font-bold ${s.covered === s.total ? "text-sky" : "text-muted"}`}>{s.covered === s.total ? "Everyone has a pick" : `${s.covered} of ${s.total} covered`}</span>
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {s.picks.map((p) => <li key={p.memberId}><b>{p.name}:</b> <Link href={`/max/deep-dive/${p.item.id}`} className="hover:underline">{p.item.name}</Link> <span className="text-xs text-faint">({p.why}{p.item.avgScore != null ? ` · ${p.item.avgScore.toFixed(1)}` : ""})</span></li>)}
                </ul>
                {s.missing.length > 0 && <p className="text-xs text-faint">Nothing matched for {s.missing.join(", ")} yet.</p>}
                <form action={createPlan}>
                  <input type="hidden" name="group" value={g.id} /><input type="hidden" name="venue" value={s.businessSlug} /><input type="hidden" name="city" value={g.citySlug} />
                  <input type="hidden" name="title" value={g.kind === "dating" ? `Date night at ${s.businessName}` : `Dinner at ${s.businessName}`} />
                  <button className={`${btn} border border-line`}>Plan it here</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-faint">Suggestions skip anything matching someone&rsquo;s allergies or &ldquo;won&rsquo;t eat&rdquo; list, and never suggest alcohol for kids. Always confirm allergies with the restaurant.</p>
      </section>

      <section id="plans" aria-labelledby="plans-h" className="flex flex-col gap-3">
        <h2 id="plans-h" className="text-xl font-bold">{g.kind === "dating" ? "Date plans" : "Plans"}</h2>
        {g.plans.length === 0 && <p className="text-sm text-muted">Nothing planned yet.</p>}
        {g.plans.map((p) => {
          const menu = menuBy.get(p.id) ?? [];
          return (
            <article key={p.id} id={`plan-${p.id}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-bold">{p.title}</h3>
                <span className="text-xs text-muted">{p.plannedFor ? formatWhen(new Date(p.plannedFor), city.timezone) : "No date yet"}{p.status === "done" ? " · done" : ""}</span>
              </div>
              {p.business && <p className="text-sm"><Link href={`/venue/${p.business.slug}`} className="font-semibold text-sky">{p.business.name}</Link></p>}
              {p.notes && <p className="text-sm text-muted">{p.notes}</p>}
              <ul className="flex flex-col gap-1.5">
                {active.map((m) => {
                  const picks = p.picks.filter((x) => x.memberId === m.memberId);
                  return (
                    <li key={m.memberId} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 truncate font-semibold">{m.name}</span>
                      {picks.length === 0 && <span className="text-xs text-faint">No pick yet</span>}
                      {picks.map((x) => (
                        <form key={x.id} action={removePick} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs">
                          <input type="hidden" name="group" value={g.id} /><input type="hidden" name="pick" value={x.id} />
                          {x.itemName}{x.priceCents != null ? ` · ${formatCents(x.priceCents)}` : ""}
                          <button aria-label={`Remove ${x.itemName}`} className="text-faint hover:text-danger">✕</button>
                        </form>
                      ))}
                    </li>
                  );
                })}
              </ul>
              {p.business && menu.length > 0 && p.status !== "done" && (
                <form action={addPick} className="flex flex-wrap gap-2">
                  <input type="hidden" name="group" value={g.id} /><input type="hidden" name="plan" value={p.id} />
                  <select name="member" aria-label="For" className={input}>{active.map((m) => <option key={m.memberId} value={m.memberId}>{m.name}</option>)}</select>
                  <select name="item" aria-label="Menu item" className={`${input} min-w-0 flex-1`}>
                    {menu.filter((i) => !i.soldOut).map((i) => <option key={i.id} value={i.id}>{i.name}{i.priceCents != null ? ` · ${formatCents(i.priceCents)}` : ""}{i.avgScore != null ? ` · ${i.avgScore.toFixed(1)}` : ""}</option>)}
                  </select>
                  <button className={`${btn} vybe-gradient text-ink`}>Add pick</button>
                </form>
              )}
              {p.picks.length > 0 && (
                <p className="text-xs text-faint">Estimated total: {formatCents(p.picks.reduce((a, x) => a + (x.priceCents ?? 0), 0))} before tax and tip.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {p.status !== "done" && <form action={setPlanStatus}><input type="hidden" name="group" value={g.id} /><input type="hidden" name="plan" value={p.id} /><input type="hidden" name="status" value="done" /><button className="min-h-9 rounded-full border border-line px-3 text-xs font-bold">Mark done</button></form>}
                <form action={setPlanStatus}><input type="hidden" name="group" value={g.id} /><input type="hidden" name="plan" value={p.id} /><input type="hidden" name="status" value="cancelled" /><button className="min-h-9 rounded-full px-3 text-xs font-bold text-muted hover:text-danger">Cancel plan</button></form>
                {p.business && <Link href={`/vybe/new?venue=${p.business.slug}`} className="min-h-9 rounded-full px-3 py-2 text-xs font-bold text-sky">Turn into a Link Up</Link>}
              </div>
            </article>
          );
        })}
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-bold">+ {g.kind === "dating" ? "Plan a date" : "New plan"}</summary>
          <form action={createPlan} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="group" value={g.id} /><input type="hidden" name="city" value={g.citySlug} />
            <input name="title" required maxLength={80} placeholder={g.kind === "dating" ? "Anniversary dinner" : "Sunday family dinner"} aria-label="Plan name" className={`${input} sm:col-span-2`} />
            <input name="date" type="date" min={today} aria-label="Date" className={input} />
            <input name="time" type="time" defaultValue="19:00" aria-label="Time" className={input} />
            <PlacePicker name="venue" valueKey="slug" city={g.citySlug} placeholder="Search for a place, or pick one later" className="sm:col-span-2" />
            <input name="notes" maxLength={500} placeholder="Notes (reservation, dress code…)" aria-label="Notes" className={`${input} sm:col-span-2`} />
            <button className={`${btn} vybe-gradient self-start text-ink`}>Save plan</button>
          </form>
        </details>
      </section>

      <section className="flex flex-wrap gap-2 border-t border-line pt-5">
        {g.myRole !== "owner" && <form action={leaveGroup}><input type="hidden" name="group" value={g.id} /><button className={`${btn} border border-line`}>Leave group</button></form>}
        {g.myRole === "owner" && <form action={deleteGroup}><input type="hidden" name="group" value={g.id} /><button className={`${btn} border border-danger/50 text-danger`}>Delete group</button></form>}
      </section>
    </div>
  );
}
