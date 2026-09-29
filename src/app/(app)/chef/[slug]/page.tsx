import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { DemoBadge } from "@/components/ui/DemoBadge";
import {
  AVAILABILITY_LABEL, PRICE_TYPE_LABEL, REVIEWABLE_SERVICES, REVIEW_DIMENSIONS, SERVICE_LABELS, SOCIAL_KINDS, packagePrice, priceSummary, readNotice,
} from "@/domain/chefs/chefs";
import { getViewer } from "@/server/auth";
import { getChef, type ChefDetail, type Workplace } from "@/server/chefs";
import { reportChef, reviewChef } from "../actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ notice?: string }> };

const card = "flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4";
const input = "min-h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm";

export async function generateMetadata({ params }: Props) {
  const viewer = await getViewer();
  const chef = await getChef((await params).slug, viewer?.id ?? null);
  return { title: chef?.name ?? "Chef" };
}

const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtYear = (ymd: string | null) => (ymd ? ymd.slice(0, 4) : null);

function ChefPhoto({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="vybe-gradient inline-grid size-24 shrink-0 place-items-center rounded-full p-[3px]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- chef-provided https URL
        <img src={url} alt="" className="size-full rounded-full border-2 border-ink object-cover" />
      ) : (
        <span aria-hidden className="grid size-full place-items-center rounded-full border-2 border-ink bg-surface-2 font-display text-3xl font-extrabold">
          {name.replace(/^chef\s+/i, "").slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function WorkplaceLine({ w }: { w: Workplace }) {
  const years = [fmtYear(w.startDate), w.current ? null : fmtYear(w.endDate)].filter(Boolean).join("–");
  return (
    <li className="flex flex-col">
      <span>
        {w.business ? <Link href={`/venue/${w.business.slug}`} className="font-semibold text-sky">{w.business.name}</Link> : <span className="font-semibold">A place no longer on VYBR8</span>}
        {" · "}{w.role}{years && <span className="text-faint"> · {years}</span>}
      </span>
      <span className="text-xs text-faint">{w.sourceLabel}</span>
    </li>
  );
}

function statusLine(c: ChefDetail): string {
  if (c.restaurantOnly) return "Cooking at a restaurant right now, not taking private bookings.";
  if (c.accepting) return "Accepting clients";
  return "Not accepting clients right now";
}

function Score({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-surface-2 p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="font-display text-2xl font-extrabold tabular-nums">{value == null ? "–" : `${suffix === "%" ? Math.round(value) : value.toFixed(1)}${suffix}`}</dd>
    </div>
  );
}

export default async function ChefPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { notice } = await searchParams;
  const viewer = await getViewer();
  const c = await getChef(slug, viewer?.id ?? null);
  if (!c) notFound();
  const msg = readNotice(notice);
  const prices = priceSummary(c);
  const s = c.reviewStats;
  const hasScores = c.signatureDishes.some((d) => d.avgScore != null);
  const availableFlags = [
    c.availableEvents && "Events", c.availableCatering && "Catering", c.availablePrivateDining && "Private dining", c.availableMealPrep && "Meal prep",
  ].filter(Boolean) as string[];
  const dietary = c.specialtyRows.filter((r) => r.isDietary).map((r) => r.cuisine);
  const cuisines = c.specialtyRows.filter((r) => !r.isDietary).map((r) => r.cuisine);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/chefs" className="text-sm font-semibold text-muted hover:text-text">← Chefs</Link>

      {msg && (
        <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-sky/40 bg-sky/10" : "border-danger/50 text-danger"}`}>{msg.text}</p>
      )}

      <header className="flex flex-col gap-4">
        {c.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- chef-provided https cover
          <img src={c.coverUrl} alt="" className="h-40 w-full rounded-[var(--radius-card)] object-cover sm:h-56" />
        ) : (
          <div aria-hidden className="vybe-gradient h-24 w-full rounded-[var(--radius-card)] opacity-60 sm:h-32" />
        )}
        <div className="-mt-14 flex flex-col gap-3 px-2 sm:flex-row sm:items-end">
          <ChefPhoto url={c.photoUrl} name={c.name} />
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-extrabold leading-tight">{c.name}</h1>
              {c.verified && <span className="rounded-full bg-sky/15 px-2 py-0.5 text-xs font-bold text-sky">Verified by VYBR8</span>}
              {c.isDemo && <DemoBadge label="Demo chef" />}
            </div>
            {c.headline && <p className="text-muted">{c.headline}</p>}
          </div>
        </div>
        {!c.isListed && c.isOwner && <p className="rounded-xl border border-line p-3 text-sm text-muted">Only you can see this profile right now.</p>}
        {!c.userId && !c.isDemo && (
          <p className="rounded-xl border border-coral/40 bg-surface p-3 text-sm">
            <b>Is this you?</b> <Link href={`/chef/${c.slug}/claim`} className="font-bold text-coral">Claim this chef profile</Link>{" "}
            <span className="text-muted">to run it and get verified.</span>
          </p>
        )}
        {c.isOwner && <Link href="/chef/dashboard" className="inline-flex min-h-11 w-fit items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Edit your Chef Profile</Link>}

        {c.currentWorkplaces.length > 0 && (
          <div className="flex flex-col gap-1">
            {c.currentWorkplaces.map((w) => (
              <p key={w.id} className="flex flex-col">
                <span>
                  Currently at:{" "}
                  {w.business ? <Link href={`/venue/${w.business.slug}`} className="font-semibold text-sky">{w.business.name}</Link> : "a place no longer on VYBR8"}
                  {" · "}{w.role}
                </span>
                <span className="text-xs text-faint">{w.sourceLabel}</span>
              </p>
            ))}
          </div>
        )}
        {c.bio && <p className="whitespace-pre-line">{c.bio}</p>}
      </header>

      <section aria-labelledby="about-h" className={card}>
        <h2 id="about-h" className="text-lg font-bold">About</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-faint">Availability</dt><dd className="font-semibold">{statusLine(c)}{availableFlags.length > 0 && <span className="block font-normal text-muted">Available for: {availableFlags.join(", ")}</span>}</dd></div>
          {(c.serviceArea || c.cityName) && <div><dt className="text-faint">Service area</dt><dd>{c.serviceArea ?? c.cityName}</dd></div>}
          {c.yearsExperience != null && <div><dt className="text-faint">Experience</dt><dd>{c.yearsExperience} {c.yearsExperience === 1 ? "year" : "years"}</dd></div>}
          {c.culinaryBackground && <div><dt className="text-faint">Background</dt><dd>{c.culinaryBackground}</dd></div>}
          {cuisines.length > 0 && <div><dt className="text-faint">Cuisine specialties</dt><dd>{cuisines.join(" · ")}</dd></div>}
          {dietary.length > 0 && <div><dt className="text-faint">Dietary</dt><dd>{dietary.join(" · ")}</dd></div>}
          {(c.minGuests != null || c.maxGuests != null) && (
            <div><dt className="text-faint">Group size</dt><dd>{c.minGuests ?? 1}–{c.maxGuests ?? "any"} guests</dd></div>
          )}
        </dl>
        {c.services.length > 0 && (
          <ul aria-label="Services" className="flex flex-wrap gap-1.5">
            {c.services.map((sv) => <li key={sv} className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{SERVICE_LABELS[sv]}</li>)}
          </ul>
        )}
        {c.formerWorkplaces.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <h3 className="text-sm font-bold text-muted">Previously</h3>
            <ul className="flex flex-col gap-2 text-sm">{c.formerWorkplaces.map((w) => <WorkplaceLine key={w.id} w={w} />)}</ul>
          </div>
        )}
      </section>

      {c.signatureDishes.length > 0 && (
        <section aria-labelledby="dishes-h" className={card}>
          <h2 id="dishes-h" className="text-lg font-bold">Signature dishes</h2>
          {hasScores && <p className="text-xs text-faint">VYBR8-ranked dishes, scored by people who ate them.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {c.signatureDishes.map((d) => (
              <li key={d.itemId}>
                <Link href={`/max/deep-dive/${d.itemId}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-text">
                  <span className="flex flex-col">
                    <span className="font-semibold">{d.name}{d.avgScore != null && <> <span aria-hidden>—</span> <span className="vybe-text font-display font-extrabold">{d.avgScore.toFixed(1)}</span></>}</span>
                    <span className="text-xs text-faint">
                      {d.business ? `${d.business.name} · ` : ""}{d.types.map((t) => t.label).join(", ")} · {d.sourceLabel}
                    </span>
                  </span>
                  <span aria-hidden className="text-faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.portfolio.length > 0 && (
        <section aria-labelledby="portfolio-h" className="flex flex-col gap-3">
          <h2 id="portfolio-h" className="text-lg font-bold">Portfolio</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {c.portfolio.map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- chef-provided https image */}
                <img src={p.imageUrl} alt={p.caption ?? `Dish by ${c.name}`} className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
                {p.caption && <span className="text-xs text-muted">{p.caption}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(c.packages.length > 0 || prices.length > 0) && (
        <section aria-labelledby="packages-h" className={card}>
          <h2 id="packages-h" className="text-lg font-bold">Services &amp; pricing</h2>
          {prices.length > 0 && <p className="font-semibold">{prices.join(" · ")}</p>}
          {c.packages.length > 0 && (
            <ul className="flex flex-col gap-3">
              {c.packages.map((p) => (
                <li key={p.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold">{p.name}</span>
                    <span className="text-sm font-semibold">{packagePrice(p.priceType, p.priceCents)}</span>
                  </div>
                  <span className="text-xs text-faint">
                    {PRICE_TYPE_LABEL[p.priceType]}
                    {(p.minGuests != null || p.maxGuests != null) && ` · ${p.minGuests ?? 1}–${p.maxGuests ?? "any"} guests`}
                  </span>
                  {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-faint">Prices are estimates. The chef confirms your quote.</p>
        </section>
      )}

      {c.availability.length > 0 && (
        <section aria-labelledby="avail-h" className={card}>
          <h2 id="avail-h" className="text-lg font-bold">Upcoming dates</h2>
          <ul className="flex flex-wrap gap-2">
            {c.availability.map((a) => (
              <li key={a.day} className={`rounded-xl px-3 py-2 text-sm ${a.status === "booked" ? "bg-surface-2 text-faint" : a.status === "limited" ? "border border-orange/40 text-orange" : "border border-sky/40 text-sky"}`}>
                <span className="font-semibold">{fmtDay(a.day)}</span> · {AVAILABILITY_LABEL[a.status]}{a.note ? ` · ${a.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(c.bookingUrl || c.website || c.contactEmail || c.socials.length > 0) && (
        <section aria-labelledby="book-h" className={card}>
          <h2 id="book-h" className="text-lg font-bold">Book or get in touch</h2>
          <div className="flex flex-wrap gap-2">
            {c.bookingUrl && <a href={c.bookingUrl} target="_blank" rel="noopener noreferrer nofollow" className="vybe-gradient inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold text-ink">Request a booking</a>}
            {c.contactEmail && <a href={`mailto:${c.contactEmail}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Email</a>}
            {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">Website</a>}
            {c.socials.map((so) => (
              <a key={so.kind} href={so.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold hover:bg-surface-2">{SOCIAL_KINDS[so.kind]}</a>
            ))}
          </div>
          <p className="text-xs text-faint">Bookings happen with the chef directly.</p>
        </section>
      )}

      <section id="reviews" aria-labelledby="reviews-h" className={card}>
        <h2 id="reviews-h" className="text-lg font-bold">Chef service reviews</h2>
        <p className="text-xs text-faint">Restaurant visits are rated on the place and its dishes. Chef reviews are for chef services like private dining and catering.</p>
        {s.showScores && s.scores ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Score label="Food quality" value={s.scores.foodQuality} />
            <Score label="Professionalism" value={s.scores.professionalism} />
            <Score label="Communication" value={s.scores.communication} />
            <Score label="Presentation" value={s.scores.presentation} />
            <Score label="Timeliness" value={s.scores.timeliness} />
            <Score label="Value" value={s.scores.value} />
            <Score label="Would book again" value={s.scores.wouldBookAgainPct} suffix="%" />
          </dl>
        ) : (
          <p className="text-sm text-muted">{s.count} {s.count === 1 ? "review" : "reviews"} · {s.message}</p>
        )}
        {s.showScores && <p className="text-xs text-faint">Based on {s.count} reviews.</p>}

        {c.reviews.length > 0 && (
          <ul className="flex flex-col gap-3 border-t border-line pt-3">
            {c.reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm">
                  {r.reviewer ? (
                    <Link href={`/profile/${r.reviewer.username}`} className="flex items-center gap-2 font-semibold"><Avatar path={r.reviewer.avatarUrl} name={r.reviewer.name} size="sm" />{r.reviewer.name}</Link>
                  ) : <span className="font-semibold">A VYBR8 member</span>}
                  <span className="text-xs text-faint">· {SERVICE_LABELS[r.service]}{r.eventDate ? ` · ${fmtDay(r.eventDate)}` : ""}</span>
                </div>
                <p className="text-xs text-muted">
                  Food quality {r.foodQuality}/10
                  {r.wouldBookAgain != null && ` · ${r.wouldBookAgain ? "Would book again" : "Wouldn't book again"}`}
                </p>
                {r.body && <p className="whitespace-pre-line text-sm">{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!c.isOwner && (
        <section id="review" aria-labelledby="review-h" className={card}>
          <h2 id="review-h" className="text-lg font-bold">Review a service</h2>
          {!viewer ? (
            <p className="text-sm text-muted">
              <Link href={`/auth/sign-in?next=${encodeURIComponent(`/chef/${c.slug}#review`)}`} className="font-semibold text-sky">Sign in</Link> to review a private dinner, catering or other service from {c.name}.
            </p>
          ) : (
            <form action={reviewChef} className="flex flex-col gap-3">
              <input type="hidden" name="chefId" value={c.id} />
              <input type="hidden" name="slug" value={c.slug} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Service
                  <select name="service" required defaultValue={c.services.find((x) => x !== "restaurant_chef") ?? "private_chef"} className={input}>
                    {REVIEWABLE_SERVICES.map((sv) => <option key={sv} value={sv}>{SERVICE_LABELS[sv]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Event date (optional)
                  <input type="date" name="event_date" max={today} className={input} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {REVIEW_DIMENSIONS.map((d) => (
                  <label key={d.key} className="flex flex-col gap-1 text-sm font-semibold">
                    {d.label}{d.required ? "" : " (optional)"}
                    <select name={d.key} required={d.required} defaultValue={d.required ? "8" : ""} className={input}>
                      {!d.required && <option value="">Skip</option>}
                      {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <fieldset className="flex flex-wrap items-center gap-4 text-sm">
                <legend className="mb-1 font-semibold">Would you book again?</legend>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="would_book_again" value="yes" className="size-5 accent-coral" /> Yes</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="would_book_again" value="no" className="size-5 accent-coral" /> No</label>
              </fieldset>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                What should people know? (optional)
                <textarea name="body" maxLength={1000} rows={3} className="rounded-xl border border-line bg-ink px-3 py-2 text-sm font-normal" />
              </label>
              <button className="vybe-gradient min-h-11 w-fit rounded-full px-6 text-sm font-bold text-ink">Post review</button>
            </form>
          )}
        </section>
      )}

      {viewer && !c.isOwner && (
        <details className="self-start text-xs text-faint">
          <summary className="cursor-pointer py-2 hover:text-text">Report</summary>
          <form action={reportChef} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="chefId" value={c.id} />
            <input type="hidden" name="slug" value={c.slug} />
            <label className="flex flex-col gap-1">
              What&rsquo;s wrong?
              <select name="reason" required defaultValue="misleading" className="min-h-10 rounded-xl border border-line bg-ink px-3 text-sm text-text">
                <option value="misleading">Misleading or not accurate</option>
                <option value="inappropriate">Inappropriate</option>
              </select>
            </label>
            <button className="min-h-10 rounded-full border border-line px-4 text-sm font-bold text-text hover:bg-surface-2">Send report</button>
          </form>
        </details>
      )}
    </article>
  );
}
