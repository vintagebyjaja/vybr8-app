import Link from "next/link";
import { PerkCard } from "@/components/birthday/PerkCard";
import { FeedTabs } from "@/components/posts/FeedTabs";
import { Button } from "@/components/ui/Button";
import { birthdayStatus, formatMonthDay, parseYmd, perkUsableOn, todayIn } from "@/domain/birthday/birthday";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { getBirthdayPerks, getPendingPerks, type PerkType } from "@/server/birthday";
import { reviewPerk, suggestPerk } from "./actions";

export const metadata = { title: "Birthday Perks" };

const TABS = [
  { key: "all", label: "All" },
  { key: "free_food", label: "Free food" },
  { key: "free_drink", label: "Free drinks" },
  { key: "discount", label: "Discounts" },
] as const;

type Search = { searchParams: Promise<{ type?: string; suggest?: string }> };

export default async function BirthdayPage({ searchParams }: Search) {
  const { type: typeParam, suggest } = await searchParams;
  const type = (TABS.some((t) => t.key === typeParam) ? typeParam : "all") as (typeof TABS)[number]["key"];
  const viewer = await getViewer();
  const isStaff = !!viewer?.platformRoles.length;

  const supabase = await createClient();
  const [perks, pending, venues] = await Promise.all([
    getBirthdayPerks(type === "all" ? {} : { type: type as PerkType }),
    isStaff ? getPendingPerks() : Promise.resolve([]),
    viewer ? supabase.from("businesses").select("id, name").order("name").limit(500) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const today = todayIn();
  const birth = viewer?.birthdate ? parseYmd(viewer.birthdate) : null;
  const status = birth ? birthdayStatus(birth, today) : null;
  const usable = birth ? perks.filter((p) => perkUsableOn(p.window, birth, today)) : [];
  const usableIds = new Set(usable.map((p) => p.id));
  const others = perks.filter((p) => !usableIds.has(p.id));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Eat your vybe</p>
        <h1 className="text-4xl font-extrabold">Birthday <span className="vybe-text">Perks</span></h1>
        <p className="max-w-prose text-muted">Every place near you that gives free food, free drinks or discounts on your birthday, and when you can use them.</p>
      </header>

      {status && (
        <section aria-live="polite" className="vybe-ring flex flex-col gap-1 rounded-[var(--radius-card)] p-6">
          {status.kind === "today" ? (
            <>
              <p className="font-display text-3xl font-extrabold">Happy birthday! <span className="vybe-text">It&rsquo;s your day.</span></p>
              <p className="text-muted">{usable.length} {usable.length === 1 ? "perk is" : "perks are"} ready for you today. Bring your ID.</p>
            </>
          ) : (
            <>
              <p className="font-display text-3xl font-extrabold tabular-nums">
                <span className="vybe-text">{status.days}</span> {status.days === 1 ? "day" : "days"} to your birthday
              </p>
              <p className="text-muted">
                {formatMonthDay(status.date)} · {usable.length ? `${usable.length} birthday-month or birthday-week ${usable.length === 1 ? "perk is" : "perks are"} already open` : "We'll send you an alert a week before"}
              </p>
            </>
          )}
        </section>
      )}
      {!viewer && (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm text-muted">
          <Link href="/auth/sign-up" className="font-semibold text-sky">Create an account</Link> to get a birthday alert and see which perks you can use right now.
        </p>
      )}

      <FeedTabs tabs={TABS} active={type} base="/birthday" param="type" />

      {usable.length > 0 && (
        <section aria-labelledby="now-h" className="flex flex-col gap-3">
          <h2 id="now-h" className="text-xl font-bold">Ready for you now</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {usable.map((p) => <li key={p.id}><PerkCard perk={p} usableNow /></li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-h" className="flex flex-col gap-3">
        <h2 id="all-h" className="text-xl font-bold">{usable.length ? "More birthday perks" : "All birthday perks"} <span className="text-sm font-normal text-muted">({others.length})</span></h2>
        {others.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-muted">No perks in this category yet. Know one? Add it below.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((p) => <li key={p.id}><PerkCard perk={p} /></li>)}
          </ul>
        )}
        <p className="text-xs text-faint">
          Perks are set by each place and can change. Confirm with them before you go.{" "}
          {viewer?.hasPourAccess ? "Drink perks are for guests 21+." : "Drink perks show up 5 days before your 21st birthday."}
        </p>
      </section>

      {viewer && (
        <section id="suggest" aria-labelledby="suggest-h" className="flex max-w-2xl flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 id="suggest-h" className="text-lg font-bold">Know a birthday perk?</h2>
          <p className="text-sm text-muted">Tell us and the VYBR8 team will check it. If you manage the place, it goes live right away.</p>
          {suggest === "sent" && <p className="text-sm text-mint">Thanks! We&rsquo;ll review it soon.</p>}
          {(suggest === "invalid" || suggest === "error") && <p className="text-sm text-danger">We couldn&rsquo;t save that. Pick the place and describe the perk.</p>}
          <form action={suggestPerk} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Place
              <select name="businessId" required className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal">
                <option value="">Choose the place</option>
                {(venues.data ?? []).map((v) => <option key={v.id as string} value={v.id as string}>{v.name as string}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">The perk
              <input name="title" required maxLength={120} placeholder="Free dessert on your birthday" className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Type
              <select name="perkType" className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal">
                <option value="free_food">Free food</option>{viewer.is21Plus && <option value="free_drink">Free drink (21+)</option>}<option value="discount">Discount</option><option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">When
              <select name="window" className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal">
                <option value="day">On the birthday</option><option value="week">Birthday week</option><option value="month">Birthday month</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">What you need <span className="font-normal text-faint">(optional)</span>
              <input name="requirements" maxLength={300} placeholder="Show ID · dine-in only · rewards members" className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 font-normal" />
            </label>
            <Button type="submit" variant="ghost" className="self-start sm:col-span-2">Send it to VYBR8</Button>
          </form>
        </section>
      )}

      {isStaff && (
        <section aria-labelledby="review-h" className="flex flex-col gap-3 border-t border-line pt-8">
          <h2 id="review-h" className="text-lg font-bold">VYBR8 Team · Perks to review ({pending.length})</h2>
          {pending.length === 0 && <p className="text-sm text-muted">Nothing waiting.</p>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-col gap-2">
                <PerkCard perk={p} />
                <form action={reviewPerk} className="flex gap-2">
                  <input type="hidden" name="perkId" value={p.id} />
                  <Button name="decision" value="approve">Approve</Button>
                  <Button name="decision" value="reject" variant="danger">Reject</Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
