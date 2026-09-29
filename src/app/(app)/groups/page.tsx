import Link from "next/link";
import { GroupFaces } from "@/components/groups/GroupFaces";
import { TasteForm } from "@/components/groups/TasteForm";
import { GROUP_KINDS, GROUP_KIND_KEYS, ageOn } from "@/domain/groups/groups";
import { CITIES } from "@/domain/map/map";
import { requireViewer } from "@/server/auth";
import { getMyGroups, getMyKids, getMyTaste } from "@/server/groups";
import { getViewerCity } from "@/server/map";
import { addKid, createGroup, respondToInvite } from "./actions";

export const metadata = { title: "Groups" };

const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-faint";

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ e?: string; claimed?: string; saved?: string }> }) {
  const viewer = await requireViewer("/groups");
  const { e, claimed, saved } = await searchParams;
  const [groups, kids, taste, city] = await Promise.all([getMyGroups(viewer), getMyKids(viewer), getMyTaste(viewer), getViewerCity(viewer)]);
  const invites = groups.filter((g) => g.myStatus === "invited");
  const mine = groups.filter((g) => g.myStatus === "active");

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-4xl font-extrabold">Your <span className="vybe-text">groups</span></h1>
           <p className="mt-1 max-w-prose text-muted">Family, dating, friends, organizations and FTK (For The Kids). Everyone&rsquo;s tastes in one place, so VYBR8 can plan the day or night knowing what everyone wants.</p>      </header>

      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}
      {claimed && <p role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm">Your profile is yours now, and you&rsquo;re still in your family.</p>}

      {invites.length > 0 && (
        <section aria-labelledby="inv-h" className="flex flex-col gap-3">
          <h2 id="inv-h" className="text-xl font-bold">Invites</h2>
          <ul className="flex flex-col gap-2">
            {invites.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/40 bg-surface p-4">
                <span><b>{g.name}</b> <span className="text-sm text-muted">· {GROUP_KINDS[g.kind].label}{g.invitedBy ? ` · from ${g.invitedBy}` : ""}</span></span>
                <span className="flex gap-2">
                  {[{ v: "1", l: "Join", c: "vybe-gradient text-ink" }, { v: "0", l: "Decline", c: "border border-line" }].map((b) => (
                    <form key={b.v} action={respondToInvite}><input type="hidden" name="group" value={g.id} /><input type="hidden" name="accept" value={b.v} />
                      <button className={`min-h-10 rounded-full px-4 text-sm font-bold ${b.c}`}>{b.l}</button></form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="groups-h" className="flex flex-col gap-3">
        <h2 id="groups-h" className="text-xl font-bold">Groups</h2>
        {mine.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No groups yet. Start your family or a date-night group below.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-coral">{GROUP_KINDS[g.kind].label}</span>
                  <span className="font-display text-lg font-bold">{g.name}</span>
                  <GroupFaces faces={g.faces} total={g.memberCount} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-bold">+ New group</summary>
          <form action={createGroup} className="mt-3 flex flex-col gap-3">
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">What kind?</legend>
              {GROUP_KIND_KEYS.map((k, i) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="flex h-full flex-col rounded-xl border border-line p-3 peer-checked:border-coral peer-checked:bg-surface-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky">
                    <b className="text-sm">{GROUP_KINDS[k].label}</b><span className="text-xs text-muted">{GROUP_KINDS[k].line}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-semibold">Name<input name="name" required minLength={2} maxLength={60} placeholder="The Johnsons · Date Night · Sunday Crew" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">City
              <select name="city" defaultValue={city} className={input}>{CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
            </label>
            <input name="description" maxLength={280} placeholder="What's it for? (optional)" aria-label="Description" className={input} />
            <p className="text-xs text-faint">People you invite have to accept. Dating groups are for two people 18+.</p>
            <button className="vybe-gradient min-h-11 self-start rounded-full px-5 text-sm font-bold text-ink">Create group</button>
          </form>
        </details>
      </section>

      <section aria-labelledby="kids-h" className="flex flex-col gap-3">
        <h2 id="kids-h" className="text-xl font-bold">Kids</h2>
        <p className="text-sm text-muted">Add kids who don&rsquo;t have the app. Only you, co-parents you add, and the groups you put them in can see them. We only keep a first name, an optional birthday and their tastes (no photos). At 13+ they can take over their own profile and stay in the family.</p>
        {kids.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {kids.map((k) => (
              <li key={k.id}>
                <Link href={`/groups/kids/${k.id}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
                  <b>{k.firstName}{k.birthdate ? <span className="font-normal text-muted"> · {ageOn(k.birthdate)}</span> : null}</b>
                  <span className="text-xs text-muted">{k.claimed ? `Has their own account${k.claimedUsername ? ` (@${k.claimedUsername})` : ""}` : k.taste.likes.length ? `Loves ${k.taste.likes.slice(0, 3).join(", ")}` : "Add their favorites"}</span>
                  {k.taste.allergies.length > 0 && !k.claimed && <span className="text-xs text-coral">Allergies: {k.taste.allergies.join(", ")}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-bold">+ Add a kid</summary>
          <form action={addKid} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="returnTo" value="/groups" />
            <label className="flex flex-col gap-1 text-sm font-semibold">First name<input name="first_name" required maxLength={40} className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Birthday <span className="font-normal text-faint">(optional)</span><input name="birthdate" type="date" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Favorites<input name="likes" placeholder="chicken tenders, fries, lemonade" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Won&rsquo;t eat<input name="dislikes" placeholder="spicy, onions" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Allergies<input name="allergies" placeholder="peanuts" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Dietary<input name="dietary" placeholder="halal, vegetarian" className={input} /></label>
            <button className="vybe-gradient min-h-11 self-start rounded-full px-5 text-sm font-bold text-ink">Add kid</button>
          </form>
        </details>
        <Link href="/groups/claim" className="text-sm font-semibold text-sky">Have a transfer code? Take over my profile →</Link>
      </section>

      <section aria-labelledby="taste-h" className="flex flex-col gap-3">
        <h2 id="taste-h" className="text-xl font-bold">My tastes</h2>
        <p className="text-sm text-muted">Shared with people in your groups, so they can plan your order.</p>
        {saved && <p role="status" className="text-sm text-sky">Saved.</p>}
        <div className="rounded-2xl border border-line bg-surface p-4"><TasteForm taste={taste} returnTo="/groups" /></div>
      </section>
    </div>
  );
}
