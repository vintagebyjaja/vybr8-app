"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  CHEF_SERVICES, PRICE_TYPES, REVIEWABLE_SERVICES, SOCIAL_KINDS, VERIFICATION_METHODS, parseSpecialties, slugify,
  type ChefNotice, type SocialKind,
} from "@/domain/chefs/chefs";
import { CITIES } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";

const DASHBOARD = "/chef/dashboard";
const today = () => new Date().toISOString().slice(0, 10);

/** Form fields with blank values dropped, so optional fields parse as undefined. */
function fields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && v.trim() !== "" && !(k in out)) out[k] = v;
  return out;
}

function done(path: string, notice: ChefNotice, anchor = ""): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}notice=${notice}${anchor}`);
}

function refresh(slug?: string) {
  revalidatePath(DASHBOARD);
  revalidatePath("/chefs");
  if (slug) revalidatePath(`/chef/${slug}`);
}

/** The viewer's own chef profile (id + slug), or null. */
async function myChef(viewerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("chef_profiles").select("id, slug, verification").eq("user_id", viewerId).maybeSingle();
  return data ? { id: data.id as string, slug: data.slug as string, verification: data.verification as string } : null;
}

async function requireMyChef() {
  const viewer = await requireViewer(DASHBOARD);
  const chef = await myChef(viewer.id);
  if (!chef) redirect(DASHBOARD);
  return { viewer, chef };
}

const https = z.string().trim().max(500).regex(/^https:\/\/[^\s]+$/);
const dollars = z.coerce.number().min(0).max(1_000_000).transform((d) => Math.round(d * 100));
const guests = z.coerce.number().int().min(1).max(5000);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));

// ── Public profile: review + report ───────────────────────────────────
const dim = z.coerce.number().int().min(1).max(10);
const reviewSchema = z.object({
  chefId: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  service: z.enum(REVIEWABLE_SERVICES as [string, ...string[]]),
  food_quality: dim,
  professionalism: dim.optional(),
  communication: dim.optional(),
  presentation: dim.optional(),
  timeliness: dim.optional(),
  value: dim.optional(),
  would_book_again: z.enum(["yes", "no"]).optional(),
  event_date: ymd.optional(),
  body: z.string().trim().max(1000).optional(),
});

export async function reviewChef(form: FormData): Promise<void> {
  const raw = fields(form);
  const slug = z.string().regex(/^[a-z0-9-]{1,80}$/).catch("").parse(raw.slug);
  const back = slug ? `/chef/${slug}` : "/chefs";
  const viewer = await requireViewer(back);
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success || (parsed.data.event_date && parsed.data.event_date > today())) done(back, "invalid", "#review");
  const r = parsed.data;
  const supabase = await createClient();
  const { data: chef } = await supabase.from("chef_profiles").select("user_id").eq("id", r.chefId).maybeSingle();
  if (!chef) done("/chefs", "failed");
  if (chef.user_id === viewer.id) done(back, "own_profile", "#review");
  const { error } = await supabase.from("chef_reviews").insert({
    chef_id: r.chefId, reviewer_id: viewer.id, service: r.service,
    food_quality: r.food_quality, professionalism: r.professionalism ?? null, communication: r.communication ?? null,
    presentation: r.presentation ?? null, timeliness: r.timeliness ?? null, value: r.value ?? null,
    would_book_again: r.would_book_again ? r.would_book_again === "yes" : null,
    event_date: r.event_date ?? null, body: r.body || null,
  });
  if (error) {
    log.warn("chef.review_failed", { userId: viewer.id, chefId: r.chefId, code: error.code });
    done(back, error.code === "23505" ? "duplicate_review" : "failed", "#review");
  }
  revalidatePath(back);
  done(back, "reviewed", "#reviews");
}

const reportSchema = z.object({ chefId: z.uuid(), slug: z.string().regex(/^[a-z0-9-]{1,80}$/), reason: z.enum(["misleading", "inappropriate"]) });

export async function reportChef(form: FormData): Promise<void> {
  const parsed = reportSchema.safeParse(fields(form));
  if (!parsed.success) redirect("/chefs");
  const back = `/chef/${parsed.data.slug}`;
  const viewer = await requireViewer(back);
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({ target_type: "chef_profile", target_id: parsed.data.chefId, reason: parsed.data.reason });
  // A second open report from the same person is fine to ignore.
  if (error && error.code !== "23505") {
    log.warn("chef.report_failed", { userId: viewer.id, chefId: parsed.data.chefId, code: error.code });
    done(back, "failed");
  }
  done(back, "reported");
}

// ── Dashboard: profile ────────────────────────────────────────────────
const citySlugs = CITIES.map((c) => c.slug) as [string, ...string[]];
const profileSchema = z.object({
  professional_name: z.string().trim().min(2).max(80),
  headline: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(2000).optional(),
  photo_url: https.optional(),
  cover_url: https.optional(),
  city_slug: z.enum(citySlugs).optional(),
  service_area: z.string().trim().max(160).optional(),
  years_experience: z.coerce.number().int().min(0).max(70).optional(),
  culinary_background: z.string().trim().max(600).optional(),
  website: https.optional(),
  booking_url: https.optional(),
  contact_email: z.email().max(200).optional(),
  instagram: https.optional(),
  tiktok: https.optional(),
  youtube: https.optional(),
  starting_price: dollars.optional(),
  per_person_price: dollars.optional(),
  hourly_price: dollars.optional(),
  min_guests: guests.optional(),
  max_guests: guests.optional(),
});
const FLAGS = ["accepting_clients", "available_events", "available_catering", "available_private_dining", "available_meal_prep", "restaurant_only", "custom_quote"] as const;

export async function saveChefProfile(form: FormData): Promise<void> {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = profileSchema.safeParse(fields(form));
  if (!parsed.success) done(DASHBOARD, "invalid");
  const p = parsed.data;
  if (p.min_guests != null && p.max_guests != null && p.min_guests > p.max_guests) done(DASHBOARD, "invalid");

  const socials = (Object.keys(SOCIAL_KINDS) as SocialKind[]).flatMap((kind) => {
    const url = p[kind];
    return url ? [{ kind, url }] : [];
  });
  const flags = Object.fromEntries(FLAGS.map((f) => [f, form.get(f) === "on"]));
  const values = {
    professional_name: p.professional_name, headline: p.headline ?? null, bio: p.bio ?? null,
    photo_url: p.photo_url ?? null, cover_url: p.cover_url ?? null, city_slug: p.city_slug ?? null, service_area: p.service_area ?? null,
    years_experience: p.years_experience ?? null, culinary_background: p.culinary_background ?? null,
    website: p.website ?? null, booking_url: p.booking_url ?? null, contact_email: p.contact_email ?? null, socials,
    starting_price_cents: p.starting_price ?? null, per_person_cents: p.per_person_price ?? null, hourly_cents: p.hourly_price ?? null,
    min_guests: p.min_guests ?? null, max_guests: p.max_guests ?? null, ...flags,
  };
  const areas = form.getAll("areas").filter((a): a is string => typeof a === "string" && citySlugs.includes(a));
  if (p.city_slug && !areas.includes(p.city_slug)) areas.push(p.city_slug);

  const supabase = await createClient();
  const existing = await myChef(viewer.id);
  let chefId: string;
  let slug: string;
  if (existing) {
    const { error } = await supabase.from("chef_profiles").update(values).eq("id", existing.id);
    if (error) {
      log.warn("chef.profile_update_failed", { userId: viewer.id, code: error.code });
      done(DASHBOARD, "failed");
    }
    chefId = existing.id;
    slug = existing.slug;
  } else {
    // New profile: slug from the name, with a short suffix if it's taken.
    const name = slugify(p.professional_name);
    const base = name === "dashboard" ? "chef-dashboard" : name;
    let created: { id: string; slug: string } | null = null;
    for (let attempt = 0; attempt < 4 && !created; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase.from("chef_profiles").insert({ ...values, slug: candidate, user_id: viewer.id }).select("id, slug").single();
      if (data) created = { id: data.id as string, slug: data.slug as string };
      else if (error?.code === "23505" && /user_id/.test(error.message)) done(DASHBOARD, "taken");
      else if (error?.code !== "23505") {
        log.warn("chef.profile_create_failed", { userId: viewer.id, code: error?.code });
        done(DASHBOARD, "failed");
      }
    }
    if (!created) done(DASHBOARD, "failed");
    chefId = created.id;
    slug = created.slug;
  }

  const { error: delErr } = await supabase.from("chef_service_areas").delete().eq("chef_id", chefId);
  const { error: insErr } = areas.length && !delErr
    ? await supabase.from("chef_service_areas").insert(areas.map((city_slug) => ({ chef_id: chefId, city_slug })))
    : { error: null };
  if (delErr || insErr) log.warn("chef.areas_failed", { userId: viewer.id, code: (delErr ?? insErr)?.code });

  refresh(slug);
  done(DASHBOARD, existing ? "saved" : "created");
}

export async function setChefServices(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const services = [...new Set(form.getAll("service"))].filter((s): s is string => typeof s === "string" && (CHEF_SERVICES as string[]).includes(s));
  const supabase = await createClient();
  const { error } = await supabase.from("chef_services").delete().eq("chef_id", chef.id);
  const { error: e2 } = !error && services.length ? await supabase.from("chef_services").insert(services.map((service) => ({ chef_id: chef.id, service }))) : { error: null };
  if (error || e2) {
    log.warn("chef.services_failed", { userId: viewer.id, code: (error ?? e2)?.code });
    done(DASHBOARD, "failed", "#services");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#services");
}

export async function setChefSpecialties(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const cuisines = parseSpecialties(String(form.get("cuisines") ?? "").slice(0, 1000));
  const dietary = parseSpecialties(String(form.get("dietary") ?? "").slice(0, 1000)).filter((d) => !cuisines.some((c) => c.toLowerCase() === d.toLowerCase()));
  const rows = [...cuisines.map((cuisine) => ({ chef_id: chef.id, cuisine, is_dietary: false })), ...dietary.map((cuisine) => ({ chef_id: chef.id, cuisine, is_dietary: true }))].slice(0, 12);
  const supabase = await createClient();
  const { error } = await supabase.from("chef_specialties").delete().eq("chef_id", chef.id);
  const { error: e2 } = !error && rows.length ? await supabase.from("chef_specialties").insert(rows) : { error: null };
  if (error || e2) {
    log.warn("chef.specialties_failed", { userId: viewer.id, code: (error ?? e2)?.code });
    done(DASHBOARD, "failed", "#specialties");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#specialties");
}

// ── Workplaces (chefs can only self-report) ───────────────────────────
const workplaceSchema = z.object({
  business: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  role: z.string().trim().min(2).max(60),
  start_date: ymd.optional(),
  end_date: ymd.optional(),
});

export async function addWorkplace(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const parsed = workplaceSchema.safeParse(fields(form));
  if (!parsed.success) done(DASHBOARD, "invalid", "#workplaces");
  const w = parsed.data;
  if (w.start_date && w.end_date && w.end_date < w.start_date) done(DASHBOARD, "invalid", "#workplaces");
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("id").eq("slug", w.business).is("deleted_at", null).maybeSingle();
  if (!biz) done(DASHBOARD, "no_business", "#workplaces");
  const { error } = await supabase.from("chef_business_relationships").insert({
    chef_id: chef.id, business_id: biz.id, role: w.role, start_date: w.start_date ?? null, end_date: w.end_date ?? null, verification_status: "self_reported",
  });
  if (error) {
    log.warn("chef.workplace_add_failed", { userId: viewer.id, code: error.code });
    done(DASHBOARD, "failed", "#workplaces");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#workplaces");
}

export async function endWorkplace(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) done(DASHBOARD, "invalid", "#workplaces");
  const supabase = await createClient();
  const { data: rel } = await supabase.from("chef_business_relationships").select("verification_status").eq("id", id.data).eq("chef_id", chef.id).maybeSingle();
  if (!rel) done(DASHBOARD, "failed", "#workplaces");
  if (rel.verification_status !== "self_reported") done(DASHBOARD, "confirmed_locked", "#workplaces");
  const { error } = await supabase.from("chef_business_relationships").update({ end_date: today() }).eq("id", id.data).eq("chef_id", chef.id);
  if (error) {
    log.warn("chef.workplace_end_failed", { userId: viewer.id, code: error.code });
    done(DASHBOARD, "failed", "#workplaces");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#workplaces");
}

// ── Packages ──────────────────────────────────────────────────────────
const packageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).optional(),
  price_type: z.enum(PRICE_TYPES as [string, ...string[]]),
  price: dollars.optional(),
  min_guests: guests.optional(),
  max_guests: guests.optional(),
});

export async function addPackage(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const parsed = packageSchema.safeParse(fields(form));
  if (!parsed.success) done(DASHBOARD, "invalid", "#packages");
  const p = parsed.data;
  if ((p.price_type !== "custom_quote" && p.price == null) || (p.min_guests != null && p.max_guests != null && p.min_guests > p.max_guests)) {
    done(DASHBOARD, "invalid", "#packages");
  }
  const supabase = await createClient();
  const { count } = await supabase.from("chef_service_packages").select("id", { count: "exact", head: true }).eq("chef_id", chef.id);
  const { error } = await supabase.from("chef_service_packages").insert({
    chef_id: chef.id, name: p.name, description: p.description ?? null, price_type: p.price_type,
    price_cents: p.price_type === "custom_quote" ? null : p.price, min_guests: p.min_guests ?? null, max_guests: p.max_guests ?? null,
    position: Math.min((count ?? 0) + 1, 100),
  });
  if (error) {
    log.warn("chef.package_add_failed", { userId: viewer.id, code: error.code });
    done(DASHBOARD, "failed", "#packages");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#packages");
}

export async function removePackage(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) done(DASHBOARD, "invalid", "#packages");
  const supabase = await createClient();
  const { error } = await supabase.from("chef_service_packages").delete().eq("id", id.data).eq("chef_id", chef.id);
  if (error) {
    log.warn("chef.package_remove_failed", { userId: viewer.id, code: error.code });
    done(DASHBOARD, "failed", "#packages");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#packages");
}

// ── Availability ──────────────────────────────────────────────────────
const availabilitySchema = z.object({
  day: ymd,
  status: z.enum(["available", "limited", "booked", "clear"]),
  note: z.string().trim().max(120).optional(),
});

export async function setAvailability(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const parsed = availabilitySchema.safeParse(fields(form));
  const t = today();
  const max = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
  if (!parsed.success || parsed.data.day < t || parsed.data.day > max) done(DASHBOARD, "invalid", "#availability");
  const a = parsed.data;
  const supabase = await createClient();
  const { error } = a.status === "clear"
    ? await supabase.from("chef_availability").delete().eq("chef_id", chef.id).eq("day", a.day)
    : await supabase.from("chef_availability").upsert({ chef_id: chef.id, day: a.day, status: a.status, note: a.note ?? null }, { onConflict: "chef_id,day" });
  if (error) {
    log.warn("chef.availability_failed", { userId: viewer.id, code: error.code });
    done(DASHBOARD, "failed", "#availability");
  }
  refresh(chef.slug);
  done(DASHBOARD, "saved", "#availability");
}

// ── Verification ──────────────────────────────────────────────────────
const verificationSchema = z.object({
  method: z.enum(Object.keys(VERIFICATION_METHODS) as [string, ...string[]]),
  evidence: z.string().trim().max(1000).optional(),
});

export async function requestVerification(form: FormData): Promise<void> {
  const { viewer, chef } = await requireMyChef();
  const parsed = verificationSchema.safeParse(fields(form));
  if (!parsed.success) done(DASHBOARD, "invalid", "#verification");
  const supabase = await createClient();
  const { error } = await supabase.from("chef_verifications").insert({ chef_id: chef.id, method: parsed.data.method, evidence: parsed.data.evidence ?? null });
  if (error) {
    log.warn("chef.verification_request_failed", { userId: viewer.id, code: error.code });
    done(DASHBOARD, "failed", "#verification");
  }
  if (chef.verification === "unverified") {
    const { error: e2 } = await supabase.from("chef_profiles").update({ verification: "pending" }).eq("id", chef.id);
    if (e2) log.warn("chef.verification_pending_failed", { userId: viewer.id, code: e2.code });
  }
  refresh(chef.slug);
  done(DASHBOARD, "requested", "#verification");
}
