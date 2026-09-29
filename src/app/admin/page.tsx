import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireAdmin } from "@/server/auth";
import { approveClaim, rejectClaim } from "./actions";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound(); // don't reveal the admin area exists
    throw e;
  }

  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("business_claims")
    .select("id, claimant_role, created_at, business:businesses(name, slug, is_demo), claimant:profiles!business_claims_claimant_id_fkey(username)")
    .eq("status", "pending")
    .order("created_at");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-text">← Back to VYBR8</Link>
      <h1 className="text-3xl font-bold">Admin</h1>

      <section aria-labelledby="claims" className="flex flex-col gap-3">
        <h2 id="claims" className="text-lg font-bold">Pending business claims ({claims?.length ?? 0})</h2>
        {!claims?.length && <p className="text-sm text-muted">No claims waiting for review.</p>}
        <ul className="flex flex-col gap-3">
          {claims?.map((c) => {
            const business = Array.isArray(c.business) ? c.business[0] : c.business;
            const claimant = Array.isArray(c.claimant) ? c.claimant[0] : c.claimant;
            return (
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{business?.name}</p>
                  {business?.is_demo && <DemoBadge />}
                </div>
                <p className="text-sm text-muted">
                  @{claimant?.username} · {c.claimant_role ?? "Role not given"} · filed {new Date(c.created_at).toLocaleDateString()}
                </p>
                <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="claimId" value={c.id} />
                  <label className="sr-only" htmlFor={`note-${c.id}`}>Decision note</label>
                  <input id={`note-${c.id}`} name="note" placeholder="Decision note (how it was verified, or why not)" className="min-h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm" />
                  <Button formAction={approveClaim}>Approve</Button>
                  <Button formAction={rejectClaim} variant="danger">Reject</Button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
