import Link from "next/link";
import { approveCreator, confirmProof, rejectCreator } from "@/app/(app)/team/actions";
import { CreatorBadge } from "@/components/posts/Badges";
import { Button } from "@/components/ui/Button";
import type { PendingApplication } from "@/domain/posts/feed-types";

/** Creator verification cards for the VYBR8 Team. Used on team profiles and the full queue page. */
export function CreatorQueue({ applications, returnTo }: { applications: PendingApplication[]; returnTo: string }) {
  if (!applications.length) return <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No creators waiting for verification.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {applications.map((a) => (
        <li key={a.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/profile/${a.applicant.username}`} className="font-bold hover:underline">{a.applicant.displayName ?? a.applicant.username}</Link>
            <span className="text-sm text-muted">@{a.applicant.username}</span>
            <span className="text-xs text-faint">wants</span>
            <CreatorBadge type={a.creatorType} />
          </div>
          <p className="text-sm text-muted">{a.pitch}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
            <li>{a.applicant.postCount} posts on VYBR8</li>
            {a.city && <li>{a.city}</li>}
            {a.creatorType !== "big_back" && <li className={a.is21PlusAttested ? "text-mint" : "text-danger"}>{a.is21PlusAttested ? "Confirmed 21+" : "21+ not confirmed"}</li>}
            <li>Applied {new Date(a.createdAt).toLocaleDateString()}</li>
            {a.links.map((l) => (
              <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sky hover:underline">{l.platform ?? "Link"}</a></li>
            ))}
          </ul>
          <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${a.proofConfirmed ? "border-sky/40" : "border-orange/40"}`}>
            <span>
              Proof code <code className="rounded bg-surface-2 px-1.5 py-0.5 font-bold text-orange">{a.proofCode}</code>
              {a.proofConfirmed ? <span className="ml-2 text-sky">Confirmed</span> : <span className="ml-2 text-muted">Open their account above and check the code is in their bio or a recent post.</span>}
            </span>
            {!a.proofConfirmed && (
              <form action={confirmProof}>
                <input type="hidden" name="applicationId" value={a.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="min-h-9 rounded-full border border-sky/60 px-4 text-xs font-bold text-sky">I saw the code</button>
              </form>
            )}
          </div>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="hidden" name="applicationId" value={a.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="sr-only" htmlFor={`note-${a.id}`}>Note</label>
            <input id={`note-${a.id}`} name="note" maxLength={500} placeholder="Note (required to decline)" className="min-h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm" />
            <Button formAction={approveCreator} disabled={!a.proofConfirmed} title={a.proofConfirmed ? undefined : "Confirm the proof code first"}>Verify</Button>
            <Button formAction={rejectCreator} variant="danger">Decline</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
