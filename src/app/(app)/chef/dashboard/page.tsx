import Link from "next/link";
import {
  AVAILABILITY_LABEL, CHEF_SERVICES, PRICE_TYPES, PRICE_TYPE_LABEL, SERVICE_LABELS, SOCIAL_KINDS, VERIFICATION_METHODS, packagePrice, readNotice,
  type SocialKind,
} from "@/domain/chefs/chefs";
import { CITIES } from "@/domain/map/map";
import { requireViewer } from "@/server/auth";
import { getMyChefProfile, type MyChefProfile } from "@/server/chefs";
import {
  addPackage, addWorkplace, endWorkplace, removePackage, requestVerification, saveChefProfile, setAvailability, setChefServices, setChefSpecialties,
} from "../actions";

export const metadata = { title: "Chef dashboard" };

type Props = { searchParams: Promise<{ notice?: string }> };

const card = "flex scroll-mt-24 flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4";
const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm font-normal";
const label = "flex flex-col gap-1 text-sm font-semibold";
const check = "flex min-h-11 items-center gap-2 text-sm font-semibold";
const primary = "vybe-gradient min-h-11 w-fit rounded-full px-6 text-sm font-bold text-ink";
const small = "min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:bg-surface-2";
const dollars = (cents: number | null | undefined) => (cents == null ? "" : String(cents / 100));

const FLAG_LABELS = [
  ["accepting_clients", "Accepting clients"],
  ["available_events", "Available for events"],
  ["available_catering", "Available for catering"],
  ["available_private_dining", "Available for private dining"],
  ["available_meal_prep", "Available for meal prep"],
  ["restaurant_only", "Restaurant only for now (no private bookings)"],
  ["custom_quote", "I give custom quotes"],
] as const;

function flagValue(c: MyChefProfile | null, key: (typeof FLAG_LABELS)[number][0]): boolean {
  if (!c) return key === "custom_quote";
  const map = {
    accepting_clients: c.accepting, available_events: c.availableEvents, available_catering: c.availableCatering,
    available_private_dining: c.availablePrivateDining, available_meal_prep: c.availableMealPrep, restaurant_only: c.restaurantOnly, custom_quote: c.customQuote,
  };
  return map[key];
}

/** Create or edit the profile basics. One form for both, so nothing drifts. */
function ProfileForm({ c }: { c: MyChefProfile | null }) {
  const social = (k: SocialKind) => c?.socials.find((s) => s.kind === k)?.url ?? "";
  return (
    <form action={saveChefProfile} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Professional name<input name="professional_name" required minLength={2} maxLength={80} defaultValue={c?.name ?? ""} placeholder="Chef Jordan Lee" className={input} /></label>
        <label className={label}>Headline<input name="headline" maxLength={80} defaultValue={c?.headline ?? ""} placeholder="Private Chef & Caterer" className={input} /></label>
      </div>
      <label className={label}>Bio<textarea name="bio" maxLength={2000} rows={4} defaultValue={c?.bio ?? ""} placeholder="What you cook and who you cook for." className="rounded-xl border border-line bg-ink px-3 py-2 text-sm font-normal" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Photo link (https)<input name="photo_url" type="url" pattern="https://.*" defaultValue={c?.photoUrl ?? ""} placeholder="https://" className={input} /></label>
        <label className={label}>Cover image link (https)<input name="cover_url" type="url" pattern="https://.*" defaultValue={c?.coverUrl ?? ""} placeholder="https://" className={input} /></label>
        <label className={label}>
          Home city
          <select name="city_slug" defaultValue={c?.citySlug ?? ""} className={input}>
            <option value="">Choose a city</option>
            {CITIES.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
          </select>
        </label>
        <label className={label}>Service area<input name="service_area" maxLength={160} defaultValue={c?.serviceArea ?? ""} placeholder="Charlotte + 30 miles, Rock Hill" className={input} /></label>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">Also show me in</legend>
        <div className="flex flex-wrap gap-x-4">
          {CITIES.map((x) => (
            <label key={x.slug} className={check}><input type="checkbox" name="areas" value={x.slug} defaultChecked={c?.areaSlugs.includes(x.slug)} className="size-5 accent-coral" />{x.name}</label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Years of experience<input name="years_experience" type="number" min={0} max={70} inputMode="numeric" defaultValue={c?.yearsExperience ?? ""} className={input} /></label>
        <label className={label}>Culinary background<input name="culinary_background" maxLength={600} defaultValue={c?.culinaryBackground ?? ""} placeholder="Culinary school, restaurants, family kitchen" className={input} /></label>
        <label className={label}>Website (https)<input name="website" type="url" pattern="https://.*" defaultValue={c?.website ?? ""} placeholder="https://" className={input} /></label>
        <label className={label}>Booking link (https)<input name="booking_url" type="url" pattern="https://.*" defaultValue={c?.bookingUrl ?? ""} placeholder="https://" className={input} /></label>
        <label className={label}>Contact email<input name="contact_email" type="email" maxLength={200} defaultValue={c?.contactEmail ?? ""} className={input} /></label>
        {(Object.keys(SOCIAL_KINDS) as SocialKind[]).map((k) => (
          <label key={k} className={label}>{SOCIAL_KINDS[k]} link<input name={k} type="url" pattern="https://.*" defaultValue={social(k)} placeholder="https://" className={input} /></label>
        ))}
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">Availability</legend>
        <div className="grid sm:grid-cols-2">
          {FLAG_LABELS.map(([k, t]) => (
            <label key={k} className={check}><input type="checkbox" name={k} defaultChecked={flagValue(c, k)} className="size-5 accent-coral" />{t}</label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Prices (estimates, in dollars)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className={label}>Starting at<input name="starting_price" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={dollars(c?.startingCents)} className={input} /></label>
          <label className={label}>Per person<input name="per_person_price" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={dollars(c?.perPersonCents)} className={input} /></label>
          <label className={label}>Hourly<input name="hourly_price" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={dollars(c?.hourlyCents)} className={input} /></label>
          <label className={label}>Min guests<input name="min_guests" type="number" min={1} inputMode="numeric" defaultValue={c?.minGuests ?? ""} className={input} /></label>
          <label className={label}>Max guests<input name="max_guests" type="number" min={1} inputMode="numeric" defaultValue={c?.maxGuests ?? ""} className={input} /></label>
        </div>
        <p className="text-xs text-faint">Shown as &ldquo;from&rdquo; prices. You confirm every quote.</p>
      </fieldset>
      <button className={primary}>{c ? "Save profile" : "Create my Chef Profile"}</button>
    </form>
  );
}

export default async function ChefDashboardPage({ searchParams }: Props) {
  const viewer = await requireViewer("/chef/dashboard");
  const { notice } = await searchParams;
  const msg = readNotice(notice);
  const c = await getMyChefProfile(viewer.id);
  const today = new Date().toISOString().slice(0, 10);

  const banner = msg && (
    <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-sky/40 bg-sky/10" : "border-danger/50 text-danger"}`}>{msg.text}</p>
  );

  if (!c) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link href="/chefs" className="text-sm font-semibold text-muted hover:text-text">← Chefs</Link>
        {banner}
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold">Your <span className="vybe-text">Chef Profile</span></h1>
          <p className="text-muted">Free for chefs. Your participation makes VYBR8&rsquo;s food graph better.</p>
          <p className="text-sm text-muted">Show where you cook, your specialties and services, and let people book you for private dinners, catering and events.</p>
        </header>
        <section className={card} aria-label="Create your Chef Profile"><ProfileForm c={null} /></section>
      </div>
    );
  }

  const cuisines = c.specialtyRows.filter((r) => !r.isDietary).map((r) => r.cuisine).join(", ");
  const dietary = c.specialtyRows.filter((r) => r.isDietary).map((r) => r.cuisine).join(", ");
  const workplaces = [...c.currentWorkplaces, ...c.formerWorkplaces];
  const pendingRequest = c.verificationRequests.find((r) => r.status === "pending");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {banner}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Chef <span className="vybe-text">dashboard</span></h1>
        <p className="text-muted">{c.name}{c.verified ? " · Verified by VYBR8" : ""}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/chef/${c.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">View public profile</Link>
        </div>
        <p className="text-xs text-faint">Chef Pro is coming later. Everything here stays free.</p>
      </header>

      <section id="profile" aria-labelledby="profile-h" className={card}>
        <h2 id="profile-h" className="text-lg font-bold">Profile</h2>
        <ProfileForm c={c} />
      </section>

      <section id="services" aria-labelledby="services-h" className={card}>
        <h2 id="services-h" className="text-lg font-bold">Services</h2>
        <form action={setChefServices} className="flex flex-col gap-3">
          <fieldset>
            <legend className="sr-only">Services you offer</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3">
              {CHEF_SERVICES.map((sv) => (
                <label key={sv} className={check}><input type="checkbox" name="service" value={sv} defaultChecked={c.services.includes(sv)} className="size-5 accent-coral" />{SERVICE_LABELS[sv]}</label>
              ))}
            </div>
          </fieldset>
          <button className={primary}>Save services</button>
        </form>
      </section>

      <section id="specialties" aria-labelledby="spec-h" className={card}>
        <h2 id="spec-h" className="text-lg font-bold">Specialties</h2>
        <form action={setChefSpecialties} className="flex flex-col gap-3">
          <label className={label}>Cuisines (comma separated)<input name="cuisines" maxLength={600} defaultValue={cuisines} placeholder="Soul Food, Caribbean, BBQ" className={input} /></label>
          <label className={label}>Dietary options (comma separated)<input name="dietary" maxLength={600} defaultValue={dietary} placeholder="Vegan, Halal, Gluten-free options" className={input} /></label>
          <p className="text-xs text-faint">Up to 12 in total.</p>
          <button className={primary}>Save specialties</button>
        </form>
      </section>

      <section id="workplaces" aria-labelledby="work-h" className={card}>
        <h2 id="work-h" className="text-lg font-bold">Where you cook</h2>
        <p className="text-sm text-muted">Workplaces you add show as &ldquo;Self-reported&rdquo; until the business or the VYBR8 Team confirms them.</p>
        {workplaces.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {workplaces.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
                <span className="flex flex-col">
                  <span><span className="font-semibold">{w.business?.name ?? "A place no longer on VYBR8"}</span> · {w.role}</span>
                  <span className="text-xs text-faint">{w.current ? "Current" : `Ended ${w.endDate}`} · {w.sourceLabel}</span>
                </span>
                {w.current && w.source === "self_reported" && (
                  <form action={endWorkplace}>
                    <input type="hidden" name="id" value={w.id} />
                    <button className={small}>I left</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={addWorkplace} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <label className={label}>Place link name<input name="business" required maxLength={80} placeholder="ember-and-oak" className={input} /><span className="text-xs font-normal text-faint">The end of the place&rsquo;s VYBR8 link, after /venue/</span></label>
          <label className={label}>Role<input name="role" required minLength={2} maxLength={60} placeholder="Executive Chef" className={input} /></label>
          <label className={label}>Started (optional)<input name="start_date" type="date" max={today} className={input} /></label>
          <label className={label}>Ended (optional)<input name="end_date" type="date" className={input} /></label>
          <button className={`${primary} sm:col-span-2`}>Add workplace</button>
        </form>
        <p className="text-xs text-faint">Dish credits come from the restaurant or the VYBR8 Team, so they&rsquo;re always accurate.</p>
        {c.signatureDishes.length > 0 && (
          <p className="text-sm">Credited dishes: {c.signatureDishes.map((d) => d.name).join(", ")}</p>
        )}
      </section>

      <section id="packages" aria-labelledby="pkg-h" className={card}>
        <h2 id="pkg-h" className="text-lg font-bold">Packages</h2>
        {c.packages.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {c.packages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
                <span className="flex flex-col"><span className="font-semibold">{p.name}</span><span className="text-xs text-faint">{packagePrice(p.priceType, p.priceCents)}</span></span>
                <form action={removePackage}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className={small} aria-label={`Remove ${p.name}`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addPackage} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <label className={label}>Package name<input name="name" required minLength={2} maxLength={80} placeholder="Birthday dinner at home" className={input} /></label>
          <label className={label}>
            Price type
            <select name="price_type" defaultValue="per_person" className={input}>
              {PRICE_TYPES.map((t) => <option key={t} value={t}>{PRICE_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label className={label}>Price in dollars (skip for custom quote)<input name="price" type="number" min={0} step="0.01" inputMode="decimal" className={input} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Min guests<input name="min_guests" type="number" min={1} inputMode="numeric" className={input} /></label>
            <label className={label}>Max guests<input name="max_guests" type="number" min={1} inputMode="numeric" className={input} /></label>
          </div>
          <label className={`${label} sm:col-span-2`}>Description (optional)<textarea name="description" maxLength={600} rows={2} className="rounded-xl border border-line bg-ink px-3 py-2 text-sm font-normal" /></label>
          <button className={`${primary} sm:col-span-2`}>Add package</button>
        </form>
        <p className="text-xs text-faint">Prices are estimates. You confirm every quote.</p>
      </section>

      <section id="availability" aria-labelledby="avail-h" className={card}>
        <h2 id="avail-h" className="text-lg font-bold">Upcoming dates</h2>
        {c.availability.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {c.availability.map((a) => <li key={a.day} className="rounded-xl bg-surface-2 px-3 py-2">{a.day} · {AVAILABILITY_LABEL[a.status]}{a.note ? ` · ${a.note}` : ""}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-muted">No dates set for the next 30 days.</p>
        )}
        <form action={setAvailability} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
          <label className={label}>Day<input name="day" type="date" required min={today} className={input} /></label>
          <label className={label}>
            Status
            <select name="status" defaultValue="available" className={input}>
              {Object.entries(AVAILABILITY_LABEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              <option value="clear">Clear this day</option>
            </select>
          </label>
          <label className={label}>Note (optional)<input name="note" maxLength={120} placeholder="Evenings only" className={input} /></label>
          <button className={`${primary} sm:col-span-3`}>Save date</button>
        </form>
      </section>

      <section id="verification" aria-labelledby="ver-h" className={card}>
        <h2 id="ver-h" className="text-lg font-bold">Verification</h2>
        <p className="text-sm">
          Status: <span className="font-semibold">{c.verification === "verified" ? "Verified by VYBR8" : c.verification === "pending" ? "Under review" : "Not verified yet"}</span>
        </p>
        {c.verificationRequests.length > 0 && (
          <ul className="text-xs text-faint">
            {c.verificationRequests.map((r) => <li key={r.id}>{r.createdAt.slice(0, 10)} · {VERIFICATION_METHODS[r.method as keyof typeof VERIFICATION_METHODS] ?? r.method} · {r.status}</li>)}
          </ul>
        )}
        {c.verification !== "verified" && !pendingRequest && (
          <form action={requestVerification} className="flex flex-col gap-3">
            <label className={label}>
              How can we confirm it&rsquo;s you?
              <select name="method" defaultValue="business_confirmation" className={input}>
                {Object.entries(VERIFICATION_METHODS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label className={label}>Details (optional)<textarea name="evidence" maxLength={1000} rows={3} placeholder="Links, the restaurant contact, or anything that helps." className="rounded-xl border border-line bg-ink px-3 py-2 text-sm font-normal" /></label>
            <button className={primary}>Request verification</button>
          </form>
        )}
        {pendingRequest && <p className="text-sm text-muted">Thanks. The VYBR8 Team is reviewing your request.</p>}
      </section>
    </div>
  );
}
