import Link from "next/link";
import { UseMyLocation } from "@/components/places/UseMyLocation";
import { Button } from "@/components/ui/Button";
import { CITIES } from "@/domain/map/map";
import { PLACE_KINDS } from "@/domain/places/places";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getViewerCity } from "@/server/map";
import { submitPlace } from "../actions";

export const metadata = { title: "Add a place" };

const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-faint focus:border-sky";

export default async function AddPlacePage({ searchParams }: { searchParams: Promise<{ e?: string; dup?: string; name?: string }> }) {
  const viewer = await requireViewer("/places/new");
  const { e, dup, name } = await searchParams;
  const city = await getViewerCity(viewer);
  type Existing = { slug: string; name: string; branch_name: string | null };
  let existing: Existing | null = null;
  if (dup && /^[a-z0-9-]{1,80}$/.test(dup)) {
    const supabase = await createClient();
    const { data } = await supabase.from("businesses").select("slug, name, branch_name").eq("slug", dup).maybeSingle();
    existing = (data as Existing | null) ?? null;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-4xl font-extrabold">Add a <span className="vybe-text">place</span></h1>
        <p className="mt-1 text-muted">
          Know a spot that isn&rsquo;t on VYBR8 yet? Add it. The VYBR8 Team takes a quick look, then it goes live for everyone.
          Each location is its own listing, so for chains add the exact address you mean.
        </p>
      </header>

      {e && <p role="alert" className="rounded-xl border border-danger/50 p-3 text-sm text-danger">{e}</p>}
      {dup && (
        <div role="status" className="rounded-xl border border-sky/40 bg-sky/10 p-4 text-sm">
          <p className="font-semibold">That place is already on VYBR8.</p>
          {existing ? (
            <p className="mt-1">
              <Link href={`/venue/${existing.slug}`} className="font-bold text-sky">{existing.name}{existing.branch_name ? ` · ${existing.branch_name}` : ""}</Link>{" "}
              · Own it? <Link href={`/venue/${existing.slug}/claim`} className="font-bold text-coral">Claim it</Link>
            </p>
          ) : (
            <p className="mt-1 text-muted">It&rsquo;s waiting for review. Check back soon.</p>
          )}
        </div>
      )}

      <form action={submitPlace} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-semibold">Name</label>
          <input id="name" name="name" required minLength={2} maxLength={120} defaultValue={name ?? ""} placeholder="Ember & Oak" className={input} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kind" className="text-sm font-semibold">Type of place</label>
            <select id="kind" name="kind" required className={input} defaultValue="restaurant">
              {PLACE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city" className="text-sm font-semibold">City</label>
            <select id="city" name="city" required className={input} defaultValue={city}>
              {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="address" className="text-sm font-semibold">Street address</label>
          <input id="address" name="address" required minLength={5} maxLength={160} placeholder="1200 South Blvd" autoComplete="street-address" className={input} />
          <p className="text-xs text-faint">Number and street. This is how we tell franchise locations apart.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branch" className="text-sm font-semibold">Location name <span className="font-normal text-faint">(optional)</span></label>
            <input id="branch" name="branch" maxLength={80} placeholder="South End" className={input} />
            <p className="text-xs text-faint">Leave blank and we&rsquo;ll use the street name.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="postal" className="text-sm font-semibold">ZIP <span className="font-normal text-faint">(optional)</span></label>
            <input id="postal" name="postal" inputMode="numeric" maxLength={12} placeholder="28203" autoComplete="postal-code" className={input} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="website" className="text-sm font-semibold">Website <span className="font-normal text-faint">(optional)</span></label>
          <input id="website" name="website" maxLength={300} placeholder="emberandoak.com" className={input} />
        </div>

        <UseMyLocation />

        <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
          <input type="checkbox" name="own" className="mt-0.5 size-5 accent-[var(--color-coral)]" />
          <span>
            <b>I own or manage this place.</b>
            <span className="block text-muted">Next you&rsquo;ll prove it&rsquo;s yours so you can run the listing and get the VYBR8 Approved badge.</span>
          </span>
        </label>

        <Button type="submit" className="self-start">Add place</Button>
      </form>
    </div>
  );
}
