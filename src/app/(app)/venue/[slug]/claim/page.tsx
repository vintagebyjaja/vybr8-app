import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovedBadge } from "@/components/places/ApprovedBadge";
import { ProofUpload } from "@/components/places/ProofUpload";
import { Button } from "@/components/ui/Button";
import { CLAIM_METHODS, placeTitle, type ClaimMethod } from "@/domain/places/places";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { claimPlace } from "@/app/(app)/places/actions";

export const metadata = { title: "Claim this place" };

const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-faint focus:border-sky";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string }> };

export default async function ClaimPlacePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { e } = await searchParams;
  const viewer = await requireViewer(`/venue/${slug}/claim`);
  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("businesses")
    .select("id, slug, name, branch_name, status, is_claimed, locations:business_locations ( address_line1, city, region )")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!venue) notFound();
  const loc = ((venue.locations ?? []) as { address_line1: string | null; city: string; region: string }[])[0];
  const title = placeTitle(venue.name as string, venue.branch_name as string | null);

  const { data: claims } = await supabase
    .from("business_claims")
    .select("status, proof_method, proof_code, decision_note, created_at")
    .eq("business_id", venue.id as string)
    .eq("claimant_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const mine = (claims?.[0] ?? null) as { status: string; proof_method: ClaimMethod | null; proof_code: string | null; decision_note: string | null } | null;
  const method = CLAIM_METHODS.find((m) => m.key === mine?.proof_method);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href={`/venue/${venue.slug}`} className="text-sm text-muted hover:text-text">← {title}</Link>
      <header>
        <h1 className="text-3xl font-extrabold">Claim <span className="vybe-text">{title}</span></h1>
        {loc && <p className="mt-1 text-muted">{loc.address_line1 ? `${loc.address_line1}, ` : ""}{loc.city}, {loc.region}</p>}
        <p className="mt-2 text-sm text-muted">
          Owners and managers run their listing: menu, prices, hours, photos and specials. Approved places get the <ApprovedBadge small /> badge.
          Claiming never lets you edit or remove ratings.
        </p>
      </header>

      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}

      {venue.is_claimed ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm">
          {mine?.status === "approved" ? "It's yours! Your place is VYBR8 Approved." : "This location already has a verified owner. If that's wrong, email support@vybr8.live."}
        </p>
      ) : mine?.status === "pending" ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-coral/40 bg-surface p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-coral">Claim waiting for review</p>
          <p className="text-sm text-muted">Your proof code</p>
          <p className="font-display text-3xl font-extrabold tracking-wider">{mine.proof_code}</p>
          {method && <p className="text-sm">{method.steps(mine.proof_code ?? "")}</p>}
          <p className="text-xs text-faint">Most claims are reviewed within 2 business days. You&rsquo;ll get an alert when it&rsquo;s done.</p>
        </section>
      ) : (
        <>
          {mine?.status === "rejected" && (
            <p className="rounded-xl border border-line p-3 text-sm text-muted">Your last claim wasn&rsquo;t approved{mine.decision_note ? `: ${mine.decision_note}` : "."} You can try again with different proof.</p>
          )}
          <form action={claimPlace} className="flex flex-col gap-4">
            <input type="hidden" name="business" value={venue.id as string} />
            <input type="hidden" name="slug" value={venue.slug as string} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="role" className="text-sm font-semibold">Your role</label>
              <input id="role" name="role" required minLength={2} maxLength={80} placeholder="Owner, general manager, franchise owner…" className={input} />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">How will you prove it&rsquo;s yours?</legend>
              {CLAIM_METHODS.map((m, i) => (
                <label key={m.key} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-sm has-[:checked]:border-coral">
                  <input type="radio" name="method" value={m.key} defaultChecked={i === 0} required className="mt-1 accent-[var(--color-coral)]" />
                  <span><b>{m.label}</b><span className="block text-muted">{m.hint}</span></span>
                </label>
              ))}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-semibold">Business email</label>
                <input id="email" name="email" type="email" maxLength={200} placeholder="you@yourplace.com" className={input} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className="text-sm font-semibold">Business phone</label>
                <input id="phone" name="phone" type="tel" maxLength={30} placeholder="(704) 555-0100" className={input} />
              </div>
            </div>

            <ProofUpload userId={viewer.id} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm font-semibold">Anything else? <span className="font-normal text-faint">(optional)</span></label>
              <textarea id="note" name="note" maxLength={1000} rows={3} placeholder="Franchise number, links, the best time to call…" className={`${input} py-2`} />
            </div>

            <p className="text-xs text-faint">Franchise owners: claim each location you run separately. Corporate teams managing many locations can email support@vybr8.live.</p>
            <Button type="submit" className="self-start">Send claim</Button>
          </form>
        </>
      )}
    </div>
  );
}
