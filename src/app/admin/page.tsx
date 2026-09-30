import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { CHEF_CLAIM_METHODS, CLAIM_METHODS, PLACE_KINDS, placeTitle } from "@/domain/places/places";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireAdmin } from "@/server/auth";
import { decideChefClaim, reviewPlace } from "@/app/(app)/places/actions";
import { approveClaim, rejectClaim } from "./actions";

export const metadata = { title: "Admin" };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const noteInput = "min-h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm";
const methodLabel = (k: string | null) => CLAIM_METHODS.find((m) => m.key === k)?.label ?? CHEF_CLAIM_METHODS.find((m) => m.key === k)?.label ?? "Not given";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthorizationError) notFound(); // don't reveal the admin area exists
    throw e;
  }

  const supabase = await createClient();
  const [{ data: places }, { data: claims }, { data: chefClaims }, { count: openTickets }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, slug, name, branch_name, kind, website, source, created_at, submitter:profiles!businesses_created_by_fkey ( username ), locations:business_locations ( address_line1, city, region, latitude )")
      .eq("status", "pending")
      .in("source", ["community", "owner"])
      .order("created_at"),
    supabase
      .from("business_claims")
      .select("id, claimant_role, proof_method, proof_code, contact_email, contact_phone, document_path, evidence, created_at, business:businesses ( name, slug, branch_name, website, phone, is_demo, locations:business_locations ( address_line1, city, region ) ), claimant:profiles!business_claims_claimant_id_fkey ( username )")
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("chef_claims")
      .select("id, proof_method, proof_code, links, document_path, note, created_at, chef:chef_profiles ( slug, professional_name ), claimant:profiles!chef_claims_claimant_id_fkey ( username )")
      .eq("status", "pending")
      .order("created_at"),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  // Short-lived links to private proof documents.
  const docPaths = [...(claims ?? []), ...(chefClaims ?? [])].map((c) => c.document_path as string | null).filter((p): p is string => !!p);
  const { data: signed } = docPaths.length ? await supabase.storage.from("claim-docs").createSignedUrls(docPaths, 600) : { data: [] };
  const signedList = (signed ?? []) as unknown as { path: string | null; signedUrl: string | null }[];
  const docUrl = new Map<string, string>();
  for (const s of signedList) if (s.path && s.signedUrl) docUrl.set(s.path, s.signedUrl);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-text">← Back to VYBR8</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Admin</h1>
        <Link href="/admin/support" className="inline-flex min-h-11 items-center rounded-full border border-sky/60 px-5 text-sm font-bold text-sky hover:bg-sky/10">
          Support inbox{openTickets ? ` (${openTickets} open)` : ""}
        </Link>
      </div>

      <section aria-labelledby="places" className="flex flex-col gap-3">
        <h2 id="places" className="text-lg font-bold">New places to review ({places?.length ?? 0})</h2>
        {!places?.length && <p className="text-sm text-muted">No new places waiting.</p>}
        <ul className="flex flex-col gap-3">
          {places?.map((p) => {
            const loc = one(p.locations as { address_line1: string | null; city: string; region: string; latitude: number | null }[]);
            const by = one(p.submitter as { username: string } | { username: string }[] | null);
            return (
              <li key={p.id as string} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <div>
                  <Link href={`/venue/${p.slug}`} className="font-semibold text-sky">{placeTitle(p.name as string, p.branch_name as string | null)}</Link>
                  <p className="text-sm text-muted">
                    {PLACE_KINDS.find((k) => k.key === p.kind)?.label ?? (p.kind as string)} · {loc?.address_line1}, {loc?.city}, {loc?.region}
                    {loc?.latitude == null ? " · no map pin yet" : ""}
                  </p>
                  <p className="text-xs text-faint">
                    Added by @{by?.username ?? "unknown"}{p.source === "owner" ? " (says they own it)" : ""} · {new Date(p.created_at as string).toLocaleDateString()}
                    {p.website ? <> · <a href={p.website as string} target="_blank" rel="noopener noreferrer" className="text-sky">website</a></> : null}
                    {" · "}<a href={`https://www.google.com/maps/search/${encodeURIComponent(`${p.name} ${loc?.address_line1 ?? ""} ${loc?.city ?? ""}`)}`} target="_blank" rel="noopener noreferrer" className="text-sky">check on Google Maps</a>
                  </p>
                </div>
                <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="business" value={p.id as string} />
                  <input name="brand" placeholder="Franchise brand (optional)" className={noteInput} />
                  <input name="note" placeholder="Note if rejecting" className={noteInput} />
                  <Button formAction={reviewPlace} name="approve" value="1">Publish</Button>
                  <Button formAction={reviewPlace} name="approve" value="0" variant="danger">Reject</Button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="claims" className="flex flex-col gap-3">
        <h2 id="claims" className="text-lg font-bold">Place claims ({claims?.length ?? 0})</h2>
        {!claims?.length && <p className="text-sm text-muted">No claims waiting for review.</p>}
        <ul className="flex flex-col gap-3">
          {claims?.map((c) => {
            const business = one(c.business as unknown as { name: string; slug: string; branch_name: string | null; website: string | null; phone: string | null; is_demo: boolean; locations: { address_line1: string | null; city: string; region: string }[] } | null);
            const claimant = one(c.claimant as { username: string } | { username: string }[] | null);
            const loc = business?.locations?.[0];
            const ev = (c.evidence ?? {}) as { note?: string; email_matches_website?: boolean };
            const doc = c.document_path ? docUrl.get(c.document_path as string) : undefined;
            return (
              <li key={c.id as string} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {business && <Link href={`/venue/${business.slug}`} className="font-semibold text-sky">{placeTitle(business.name, business.branch_name)}</Link>}
                  {business?.is_demo && <DemoBadge />}
                </div>
                {loc && <p className="text-xs text-faint">{loc.address_line1 ? `${loc.address_line1}, ` : ""}{loc.city}, {loc.region}{business?.phone ? ` · listed phone ${business.phone}` : ""}</p>}
                <dl className="grid gap-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline text-faint">Who: </dt><dd className="inline">@{claimant?.username} · {(c.claimant_role as string) ?? "Role not given"}</dd></div>
                  <div><dt className="inline text-faint">Proof: </dt><dd className="inline">{methodLabel(c.proof_method as string | null)} · <b className="tracking-wider">{c.proof_code as string}</b></dd></div>
                  {c.contact_email && <div><dt className="inline text-faint">Email: </dt><dd className="inline">{c.contact_email as string}{ev.email_matches_website ? <span className="text-mint"> · matches website</span> : ""}</dd></div>}
                  {c.contact_phone && <div><dt className="inline text-faint">Phone: </dt><dd className="inline">{c.contact_phone as string}</dd></div>}
                  {doc && <div><dt className="inline text-faint">Document: </dt><dd className="inline"><a href={doc} target="_blank" rel="noopener noreferrer" className="text-sky">open (10 min link)</a></dd></div>}
                  {ev.note && <div className="sm:col-span-2"><dt className="inline text-faint">Note: </dt><dd className="inline">{ev.note}</dd></div>}
                </dl>
                <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="claimId" value={c.id as string} />
                  <label className="sr-only" htmlFor={`note-${c.id}`}>Decision note</label>
                  <input id={`note-${c.id}`} name="note" placeholder="How it was verified, or why not" className={noteInput} />
                  <Button formAction={approveClaim}>Approve</Button>
                  <Button formAction={rejectClaim} variant="danger">Reject</Button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="chef-claims" className="flex flex-col gap-3">
        <h2 id="chef-claims" className="text-lg font-bold">Chef profile claims ({chefClaims?.length ?? 0})</h2>
        {!chefClaims?.length && <p className="text-sm text-muted">No chef claims waiting.</p>}
        <ul className="flex flex-col gap-3">
          {chefClaims?.map((c) => {
            const chef = one(c.chef as { slug: string; professional_name: string } | { slug: string; professional_name: string }[] | null);
            const claimant = one(c.claimant as { username: string } | { username: string }[] | null);
            const doc = c.document_path ? docUrl.get(c.document_path as string) : undefined;
            return (
              <li key={c.id as string} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                {chef && <Link href={`/chef/${chef.slug}`} className="font-semibold text-sky">{chef.professional_name}</Link>}
                <p className="text-sm">
                  @{claimant?.username} · {methodLabel(c.proof_method as string)} · <b className="tracking-wider">{c.proof_code as string}</b>
                  {c.links ? <> · <span className="break-all text-muted">{c.links as string}</span></> : null}
                  {doc ? <> · <a href={doc} target="_blank" rel="noopener noreferrer" className="text-sky">document</a></> : null}
                </p>
                {c.note && <p className="text-sm text-muted">{c.note as string}</p>}
                <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="claim" value={c.id as string} />
                  <input name="note" placeholder="How it was verified, or why not" className={noteInput} />
                  <Button formAction={decideChefClaim} name="approve" value="1">Approve</Button>
                  <Button formAction={decideChefClaim} name="approve" value="0" variant="danger">Reject</Button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
