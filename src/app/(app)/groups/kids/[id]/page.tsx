import Link from "next/link";
import { notFound } from "next/navigation";
import { TasteForm } from "@/components/groups/TasteForm";
import { TransferCode } from "@/components/groups/TransferCode";
import { TRANSFER_AGE, ageOn } from "@/domain/groups/groups";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getKid } from "@/server/groups";
import { addCoParent, createTransferCode, removeKid, updateKid } from "../../actions";

export const metadata = { title: "Kid profile" };
const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm";

export default async function KidPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; saved?: string }> }) {
  const { id } = await params;
  const { e, saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer(`/groups/kids/${id}`);
  const kid = await getKid(id);
  if (!kid) notFound();
  const supabase = await createClient();
  const { data: g } = await supabase.from("dependent_guardians").select("user_id").eq("dependent_id", id).eq("user_id", viewer.id).maybeSingle();
  const isGuardian = !!g;
  const age = kid.birthdate ? ageOn(kid.birthdate) : null;

  // Co-parent candidates: adults in my family groups.
  const { data: fam } = isGuardian
    ? await supabase.from("group_members").select("user_id, profile:profiles!group_members_user_id_fkey ( display_name, username ), group:groups!inner ( kind )").eq("status", "active").eq("group.kind", "family").not("user_id", "is", null).neq("user_id", viewer.id)
    : { data: [] };
  const coParents = [...new Map(((fam ?? []) as unknown as { user_id: string; profile: { display_name: string | null; username: string } | null }[]).map((m) => [m.user_id, m])).values()];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link href="/groups" className="text-sm font-semibold text-muted hover:text-text">← Groups</Link>
      <header>
        <h1 className="text-3xl font-extrabold">{kid.firstName}</h1>
        <p className="text-muted">{age != null ? `${age} years old · ` : ""}Parents: {kid.guardians.join(", ")}</p>
      </header>
      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}
      {saved && <p role="status" className="text-sm text-sky">Saved.</p>}

      {kid.claimed ? (
        <p className="rounded-xl border border-sky/40 bg-sky/10 p-4 text-sm">{kid.firstName} has their own VYBR8 account now{kid.claimedUsername ? ` (@${kid.claimedUsername})` : ""}. They manage their own profile and are still in your family.</p>
      ) : !isGuardian ? (
        <p className="text-sm text-muted">Only {kid.firstName}&rsquo;s parents can edit this profile.</p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-bold">Basics</h2>
            <form action={updateKid} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="kid" value={kid.id} />
              <label className="flex flex-col gap-1 text-sm font-semibold">First name<input name="first_name" defaultValue={kid.firstName} required maxLength={40} className={input} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Birthday<input name="birthdate" type="date" defaultValue={kid.birthdate ?? ""} className={input} /></label>
              <button className="vybe-gradient min-h-11 self-start rounded-full px-5 text-sm font-bold text-ink">Save</button>
            </form>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-bold">What {kid.firstName} likes</h2>
            <TasteForm taste={kid.taste} kidId={kid.id} returnTo={`/groups/kids/${kid.id}`} forKid />
          </section>

          {coParents.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-bold">Add a co-parent</h2>
              <form action={addCoParent} className="flex flex-wrap gap-2">
                <input type="hidden" name="kid" value={kid.id} />
                <select name="user" aria-label="Co-parent" className={input}>{coParents.map((c) => <option key={c.user_id} value={c.user_id}>{c.profile?.display_name ?? c.profile?.username}</option>)}</select>
                <button className="min-h-11 rounded-full border border-line px-4 text-sm font-bold">Add</button>
              </form>
              <p className="text-xs text-faint">Co-parents can edit {kid.firstName}&rsquo;s profile and add them to groups.</p>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-bold">When {kid.firstName} gets their own phone</h2>
            <p className="text-sm text-muted">At {TRANSFER_AGE}+, {kid.firstName} can take over this profile. Their favorites and plan picks move to their account and they stay in your family groups.</p>
            {age != null && age < TRANSFER_AGE - 1 ? (
              <p className="text-xs text-faint">Available when they&rsquo;re closer to {TRANSFER_AGE}.</p>
            ) : (
              <TransferCode create={createTransferCode.bind(null, kid.id)} name={kid.firstName} />
            )}
          </section>

          <form action={removeKid} className="self-start">
            <input type="hidden" name="kid" value={kid.id} />
            <button className="min-h-10 rounded-full border border-danger/50 px-4 text-sm font-bold text-danger">Delete {kid.firstName}&rsquo;s profile</button>
          </form>
        </>
      )}
    </div>
  );
}
