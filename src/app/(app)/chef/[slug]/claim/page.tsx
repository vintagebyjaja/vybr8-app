import Link from "next/link";
import { notFound } from "next/navigation";
import { ProofUpload } from "@/components/places/ProofUpload";
import { Button } from "@/components/ui/Button";
import { CHEF_CLAIM_METHODS } from "@/domain/places/places";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { claimChef } from "@/app/(app)/places/actions";

export const metadata = { title: "Claim a chef profile" };

const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-faint focus:border-sky";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string }> };

export default async function ClaimChefPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { e } = await searchParams;
  const viewer = await requireViewer(`/chef/${slug}/claim`);
  const supabase = await createClient();
  const { data: chef } = await supabase.from("chef_profiles").select("id, slug, professional_name, user_id, is_demo").eq("slug", slug).maybeSingle();
  if (!chef || chef.is_demo) notFound();

  const { data: claims } = await supabase
    .from("chef_claims")
    .select("status, proof_method, proof_code, decision_note")
    .eq("chef_id", chef.id as string)
    .eq("claimant_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const mine = (claims?.[0] ?? null) as { status: string; proof_method: string; proof_code: string; decision_note: string | null } | null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href={`/chef/${chef.slug}`} className="text-sm text-muted hover:text-text">← {chef.professional_name as string}</Link>
      <header>
        <h1 className="text-3xl font-extrabold">Is this <span className="vybe-text">you</span>?</h1>
        <p className="mt-1 text-muted">
          Claim <b>{chef.professional_name as string}</b> to run the profile: services, menus, pricing, availability and booking link.
          Approved chefs are Verified by VYBR8. Claiming never lets you edit or remove reviews.
        </p>
      </header>

      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}

      {chef.user_id ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm">
          {chef.user_id === viewer.id ? "It's yours! " : "This profile already belongs to a verified chef. If that's wrong, email support@vybr8.live."}
          {chef.user_id === viewer.id && <Link href="/chef/dashboard" className="font-bold text-sky">Open your chef dashboard</Link>}
        </p>
      ) : mine?.status === "pending" ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-coral/40 bg-surface p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-coral">Claim waiting for review</p>
          <p className="text-sm text-muted">Your proof code</p>
          <p className="font-display text-3xl font-extrabold tracking-wider">{mine.proof_code}</p>
          <p className="text-sm">
            {mine.proof_method === "social"
              ? `Put ${mine.proof_code} in your Instagram, TikTok or YouTube bio (or a post) until we approve you.`
              : `Keep ${mine.proof_code} handy. The VYBR8 Team may reach out to confirm.`}
          </p>
          <p className="text-xs text-faint">You&rsquo;ll get an alert when it&rsquo;s reviewed.</p>
        </section>
      ) : (
        <>
          {mine?.status === "rejected" && (
            <p className="rounded-xl border border-line p-3 text-sm text-muted">Your last claim wasn&rsquo;t approved{mine.decision_note ? `: ${mine.decision_note}` : "."} You can try again with different proof.</p>
          )}
          <form action={claimChef} className="flex flex-col gap-4">
            <input type="hidden" name="chef" value={chef.id as string} />
            <input type="hidden" name="slug" value={chef.slug as string} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">How will you prove it&rsquo;s you?</legend>
              {CHEF_CLAIM_METHODS.map((m, i) => (
                <label key={m.key} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-sm has-[:checked]:border-coral">
                  <input type="radio" name="method" value={m.key} defaultChecked={i === 0} required className="mt-1 accent-[var(--color-coral)]" />
                  <span><b>{m.label}</b><span className="block text-muted">{m.hint}</span></span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="links" className="text-sm font-semibold">Links</label>
              <input id="links" name="links" maxLength={600} placeholder="https://instagram.com/yourname" className={input} />
            </div>
            <ProofUpload userId={viewer.id} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm font-semibold">Anything else? <span className="font-normal text-faint">(optional)</span></label>
              <textarea id="note" name="note" maxLength={1000} rows={3} placeholder="Where you cook now, who can vouch for you…" className={`${input} py-2`} />
            </div>
            <Button type="submit" className="self-start">Send claim</Button>
          </form>
        </>
      )}
    </div>
  );
}
