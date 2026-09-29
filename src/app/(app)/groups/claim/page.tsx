import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { redeemTransferCode } from "../actions";

export const metadata = { title: "Take over my profile" };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireViewer("/groups/claim");
  const { e } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <Link href="/groups" className="text-sm font-semibold text-muted hover:text-text">← Groups</Link>
      <h1 className="text-3xl font-extrabold">Take over <span className="vybe-text">my profile</span></h1>
      <p className="text-muted">Did a parent set up VYBR8 for you? Enter the code they gave you. Your favorites move to this account and you stay in your family.</p>
      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}
      <form action={redeemTransferCode} className="flex flex-col gap-3">
        <label htmlFor="code" className="text-sm font-semibold">Transfer code</label>
        <input id="code" name="code" required autoComplete="off" placeholder="XXXXXX-XXXXXX-…" className="min-h-12 rounded-xl border border-line bg-surface px-4 font-display tracking-wider" />
        <button className="vybe-gradient min-h-12 rounded-full text-sm font-bold text-ink">Take over my profile</button>
      </form>
      <p className="text-xs text-faint">You need to be 13 or older. Codes work once.</p>
    </div>
  );
}
