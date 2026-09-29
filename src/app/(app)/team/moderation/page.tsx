import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireStaff } from "@/server/auth";
import { getModerationLog, getOpenReports } from "@/server/moderation";
import { dismissReports, founderDecide, removeContent } from "./actions";

export const metadata = { title: "Reports & removals" };

const REASON: Record<string, string> = {
  spam: "Spam", inappropriate: "Inappropriate", harassment: "Harassment", misleading: "Misleading",
  underage_drinking: "Underage drinking", not_food_or_drink: "Not food or drink", other: "Other",
};

export default async function ModerationPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }
  const supabase = await createClient();
  const [reports, log, { data: me }] = await Promise.all([
    getOpenReports(),
    getModerationLog(),
    supabase.from("team_members").select("is_founder").eq("user_id", staff.id).maybeSingle(),
  ]);
  const isFounder = !!me?.is_founder;
  const waiting = log.filter((a) => !a.founderDecision);

  return (
    <div className="flex flex-col gap-10">
      <header>
        <Link href="/team" className="text-sm text-muted hover:text-text">← VYBR8 Team</Link>
        <h1 className="mt-2 text-3xl font-bold">Reports &amp; removals</h1>
        <p className="mt-1 max-w-prose text-muted">
          The team can remove content. The founder reviews every removal and can agree (uphold) or reverse it (veto). A founder veto is final: the team can&rsquo;t remove that item again.
        </p>
      </header>

      <section aria-labelledby="open-h" className="flex flex-col gap-3">
        <h2 id="open-h" className="text-lg font-bold">Open reports ({reports.length})</h2>
        {reports.length === 0 && <p className="text-sm text-muted">Nothing reported right now.</p>}
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li key={`${r.targetType}:${r.targetId}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{r.link ? <Link href={r.link} className="hover:underline">{r.preview}</Link> : r.preview}</p>
                <span className="text-xs text-faint">{r.count} {r.count === 1 ? "report" : "reports"} · {r.reasons.map((x) => REASON[x] ?? x).join(", ")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={removeContent} className="flex flex-1 flex-wrap gap-2">
                  <input type="hidden" name="type" value={r.targetType} /><input type="hidden" name="id" value={r.targetId} />
                  <label className="sr-only" htmlFor={`reason-${r.targetId}`}>Reason</label>
                  <input id={`reason-${r.targetId}`} name="reason" required minLength={3} maxLength={500} placeholder="Reason (the founder sees this)" className="min-h-10 flex-1 rounded-xl border border-line bg-ink px-3 text-sm" />
                  <button className="min-h-10 rounded-full border border-danger/50 px-4 text-sm font-bold text-danger hover:bg-danger/10">Remove</button>
                </form>
                <form action={dismissReports}>
                  <input type="hidden" name="type" value={r.targetType} /><input type="hidden" name="id" value={r.targetId} />
                  <button className="min-h-10 rounded-full border border-line px-4 text-sm font-bold">Keep it</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="log-h" className="flex flex-col gap-3">
        <h2 id="log-h" className="text-lg font-bold">
          Removals {isFounder && waiting.length > 0 && <span className="text-coral">· {waiting.length} waiting for you</span>}
        </h2>
        {log.length === 0 && <p className="text-sm text-muted">No removals yet.</p>}
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {log.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{a.preview}</p>
                <span className={`text-xs font-bold ${a.founderDecision === "vetoed" ? "text-sky" : a.founderDecision === "upheld" ? "text-coral" : "text-faint"}`}>
                  {a.founderDecision === "vetoed" ? "Founder vetoed · restored" : a.founderDecision === "upheld" ? "Founder upheld" : "Waiting for founder"}
                </span>
              </div>
              <p className="text-sm text-muted">Removed by {a.takenBy} · {new Date(a.takenAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · “{a.reason}”</p>
              {a.founderNote && <p className="text-sm">Founder: “{a.founderNote}”</p>}
              {isFounder && (
                <form action={founderDecide} className="flex flex-wrap gap-2">
                  <input type="hidden" name="action" value={a.id} />
                  <input name="note" maxLength={500} placeholder="Note (optional)" aria-label="Founder note" className="min-h-10 flex-1 rounded-xl border border-line bg-ink px-3 text-sm" />
                  {a.founderDecision !== "upheld" && <button name="decision" value="upheld" className="min-h-10 rounded-full border border-coral/60 px-4 text-sm font-bold text-coral">Uphold removal</button>}
                  {a.founderDecision !== "vetoed" && <button name="decision" value="vetoed" className="min-h-10 rounded-full border border-sky/60 px-4 text-sm font-bold text-sky">Veto · restore</button>}
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
