import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorBadge } from "@/components/posts/Badges";
import { CreatorQueue } from "@/components/team/CreatorQueue";
import { Button } from "@/components/ui/Button";
import { AuthorizationError, requireStaff } from "@/server/auth";
import { getCreatorsForTeam, getPendingApplications } from "@/server/team";
import { setCreatorStatus } from "../actions";

export const metadata = { title: "Creator verification" };

export default async function CreatorVerificationPage() {
  try {
    await requireStaff();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }
  const [pending, creators] = await Promise.all([getPendingApplications(), getCreatorsForTeam()]);

  return (
    <div className="flex flex-col gap-10">
      <header>
        <Link href="/team" className="text-sm text-muted hover:text-text">← VYBR8 Team</Link>
        <h1 className="mt-2 text-3xl font-bold">Creator verification</h1>
        <p className="mt-1 text-muted">Verify Big Backs and Liquid Lovers. Every decision is logged.</p>
      </header>

      <section aria-labelledby="pending-h" className="flex flex-col gap-3">
        <h2 id="pending-h" className="text-lg font-bold">Waiting for review ({pending.total})</h2>
        <CreatorQueue applications={pending.items} returnTo="/team/creators" />
      </section>

      <section aria-labelledby="verified-h" className="flex flex-col gap-3">
        <h2 id="verified-h" className="text-lg font-bold">Creators ({creators.length})</h2>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {creators.map((c) => (
            <li key={c.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link href={`/profile/${c.username}`} className="font-semibold hover:underline">{c.displayName ?? c.username}</Link>
              <CreatorBadge type={c.creatorType} />
              {c.status === "suspended" && <span className="text-xs font-bold uppercase text-danger">Suspended</span>}
              <form action={setCreatorStatus} className="ml-auto">
                <input type="hidden" name="userId" value={c.userId} />
                <input type="hidden" name="status" value={c.status === "verified" ? "suspended" : "verified"} />
                <Button type="submit" variant={c.status === "verified" ? "danger" : "ghost"}>{c.status === "verified" ? "Suspend badge" : "Restore badge"}</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
