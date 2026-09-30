"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CITIES } from "@/domain/map/map";
import { PLACE_KIND_KEYS, type PlaceKind } from "@/domain/places/places";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff, requireViewer } from "@/server/auth";
import { log } from "@/server/log";

/** Database messages written for people pass through; anything technical becomes a generic retry. */
function friendly(msg: string | undefined) {
  if (!msg || /violates|syntax|permission denied|duplicate key|null value|invalid input/i.test(msg)) return "That didn't work. Try again.";
  return msg;
}
const back = (path: string, params: Record<string, string>): never => {
  const q = new URLSearchParams(params).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
};
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite().optional());
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

// ── Add a place ────────────────────────────────────────────────────────
const placeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(PLACE_KIND_KEYS as [PlaceKind, ...PlaceKind[]]),
  city: z.enum(CITIES.map((c) => c.slug) as [string, ...string[]]),
  address: z.string().trim().min(5).max(160),
  branch: optText(80),
  postal: optText(12),
  website: optText(300),
  lat: optNum,
  lng: optNum,
  own: z.string().optional(),
});

export async function submitPlace(form: FormData) {
  await requireViewer("/places/new");
  const p = placeSchema.safeParse(Object.fromEntries(form));
  if (!p.success) back("/places/new", { e: "Fill in the name, type, city and street address." });
  const d = p.data!;
  const website = d.website && !/^https?:\/\//i.test(d.website) ? `https://${d.website}` : d.website?.replace(/^http:\/\//i, "https://");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_place", {
    p_name: d.name, p_kind: d.kind, p_city_slug: d.city, p_address: d.address, p_branch: d.branch ?? null, p_postal: d.postal ?? null,
    p_lat: d.lat ?? null, p_lng: d.lng ?? null, p_website: website ?? null, p_i_own_it: d.own === "on",
  });
  if (error) {
    log.warn("places.submit_failed", { code: error.code });
    back("/places/new", { e: friendly(error.message) });
  }
  const r = data as { status: "created" | "duplicate"; slug: string };
  if (r.status === "duplicate") back("/places/new", { dup: r.slug });
  revalidatePath("/explore");
  redirect(d.own === "on" ? `/venue/${r.slug}/claim` : `/venue/${r.slug}?added=1`);
}

// ── Claim a place ──────────────────────────────────────────────────────
const claimSchema = z.object({
  business: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  role: z.string().trim().min(2).max(80),
  method: z.enum(["business_email", "business_phone", "document", "google_profile", "social"]),
  email: optText(200),
  phone: optText(30),
  document: optText(300),
  note: optText(1000),
});

export async function claimPlace(form: FormData) {
  const raw = Object.fromEntries(form);
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  await requireViewer(`/venue/${slug}/claim`);
  const p = claimSchema.safeParse(raw);
  if (!p.success) back(`/venue/${slug}/claim`, { e: "Tell us your role and pick how you'll prove it." });
  const d = p.data!;
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_business_claim", {
    p_business: d.business, p_role: d.role, p_method: d.method, p_email: d.email ?? null, p_phone: d.phone ?? null,
    p_document_path: d.document ?? null, p_note: d.note ?? null,
  });
  if (error) back(`/venue/${d.slug}/claim`, { e: friendly(error.message) });
  redirect(`/venue/${d.slug}/claim`);
}

// ── Claim a chef profile ───────────────────────────────────────────────
const chefClaimSchema = z.object({
  chef: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  method: z.enum(["social", "business_confirmation", "license_or_certificate", "document"]),
  links: optText(600),
  document: optText(300),
  note: optText(1000),
});

export async function claimChef(form: FormData) {
  const raw = Object.fromEntries(form);
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  await requireViewer(`/chef/${slug}/claim`);
  const p = chefClaimSchema.safeParse(raw);
  if (!p.success) back(`/chef/${slug}/claim`, { e: "Pick how you'll prove it's you." });
  const d = p.data!;
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_chef_claim", {
    p_chef: d.chef, p_method: d.method, p_links: d.links ?? null, p_document_path: d.document ?? null, p_note: d.note ?? null,
  });
  if (error) back(`/chef/${d.slug}/claim`, { e: friendly(error.message) });
  redirect(`/chef/${d.slug}/claim`);
}

// ── VYBR8 Team ─────────────────────────────────────────────────────────
export async function reviewPlace(form: FormData) {
  await requireStaff();
  const p = z.object({ business: z.uuid(), approve: z.enum(["1", "0"]), note: optText(300), brand: optText(120) }).parse(Object.fromEntries(form));
  const supabase = await createClient();
  if (p.approve === "1" && p.brand) await supabase.rpc("set_place_brand", { p_business: p.business, p_brand_name: p.brand });
  const { error } = await supabase.rpc("review_place", { p_business: p.business, p_approve: p.approve === "1", p_note: p.note ?? null });
  if (error) log.warn("places.review_failed", { code: error.code });
  revalidatePath("/admin");
}

export async function setBrand(form: FormData) {
  await requireStaff();
  const p = z.object({ business: z.uuid(), brand: z.string().trim().max(120), slug: z.string() }).parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_place_brand", { p_business: p.business, p_brand_name: p.brand });
  if (error) log.warn("places.brand_failed", { code: error.code });
  revalidatePath(`/venue/${p.slug}`);
}

export async function decideChefClaim(form: FormData) {
  await requireAdmin();
  const p = z.object({ claim: z.uuid(), approve: z.enum(["1", "0"]), note: optText(500) }).parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_chef_claim", { p_claim: p.claim, p_approve: p.approve === "1", p_note: p.note ?? null });
  if (error) log.warn("chefs.claim_decision_failed", { code: error.code });
  revalidatePath("/admin");
}

// ── Permanently closed ────────────────────────────────────────────────
/** "Closed for good?" The team's tap closes it right away; three people's reports close it too. */
export async function reportClosed(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  await requireViewer(`/venue/${slug}`);
  const id = z.uuid().safeParse(form.get("business"));
  if (!id.success || !/^[a-z0-9-]{1,80}$/.test(slug)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_place_closed", { p_business: id.data });
  if (error) {
    log.warn("places.report_closed_failed", { code: error.code });
    back(`/venue/${slug}`, { closed: "error" });
  }
  revalidatePath("/eat");
  revalidatePath("/", "layout");
  if (data === "closed") redirect(`/eat?${new URLSearchParams({ closed: "1" })}`);
  back(`/venue/${slug}`, { closed: "reported" });
}

/** Team: confirm a closure, or bring a place back (clears the reports). */
export async function reviewClosure(form: FormData) {
  await requireStaff();
  const p = z.object({ business: z.uuid(), closed: z.enum(["1", "0"]), back: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_place_closure", { p_business: p.data.business, p_closed: p.data.closed === "1" });
  if (error) log.warn("places.review_closure_failed", { code: error.code });
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  const to = p.data.back && /^\/(admin|venue\/[a-z0-9-]{1,80})$/.test(p.data.back) ? p.data.back : "/admin";
  redirect(to);
}

// ── Opening hours ─────────────────────────────────────────────────────
/** Owners and the team save hours right away; anyone else's go to the team to check. */
export async function submitHours(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return;
  await requireViewer(`/venue/${slug}`);
  const p = z.object({ location: z.uuid(), hours: z.string().max(4000), note: optText(200) }).safeParse(Object.fromEntries(form));
  if (!p.success) back(`/venue/${slug}`, { hours: "error" });
  let hours: unknown;
  try { hours = JSON.parse(p.data!.hours); } catch { back(`/venue/${slug}`, { hours: "error" }); }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_place_hours", { p_location: p.data!.location, p_hours: hours, p_note: p.data!.note ?? null });
  if (error) {
    log.warn("places.hours_failed", { code: error.code });
    back(`/venue/${slug}`, { hours: "error" });
  }
  revalidatePath(`/venue/${slug}`);
  if (data === "saved") revalidatePath("/eat");
  redirect(`/venue/${slug}?hours=${data === "saved" ? "saved" : "suggested"}#hours-h`);
}

/** Team: approve or reject suggested hours. */
export async function reviewHours(form: FormData) {
  await requireStaff();
  const p = z.object({ id: z.uuid(), approve: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_hours_suggestion", { p_id: p.data.id, p_approve: p.data.approve === "1" });
  if (error) log.warn("places.review_hours_failed", { code: error.code });
  revalidatePath("/admin");
  redirect("/admin#hours-queue");
}

// ── Owner & cause badges (Black-owned, woman-owned, gives back…) ───────
/** Owner claims or someone suggests a badge; the team verifies it (the team's own go live right away). */
export async function claimBadge(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return;
  await requireViewer(`/venue/${slug}`);
  const p = z.object({ business: z.uuid(), badge: z.string().regex(/^[a-z_]{3,20}$/), evidence: optText(500) }).safeParse(Object.fromEntries(form));
  if (!p.success) back(`/venue/${slug}`, { badge: "error" });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_place_badge", { p_business: p.data!.business, p_badge: p.data!.badge, p_evidence: p.data!.evidence ?? null });
  if (error) {
    log.warn("places.badge_failed", { code: error.code });
    back(`/venue/${slug}`, { badge: "error" });
  }
  revalidatePath(`/venue/${slug}`);
  revalidatePath("/eat");
  redirect(`/venue/${slug}?badge=${String(data)}#badges-h`);
}

/** Team: verify or turn down a badge. */
export async function reviewBadge(form: FormData) {
  await requireStaff();
  const p = z.object({ business: z.uuid(), badge: z.string().regex(/^[a-z_]{3,20}$/), approve: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_place_badge", { p_business: p.data.business, p_badge: p.data.badge, p_approve: p.data.approve === "1" });
  if (error) log.warn("places.review_badge_failed", { code: error.code });
  revalidatePath("/admin");
  revalidatePath("/eat");
  redirect("/admin#badges");
}

// ── Saved & "Never again" ──────────────────────────────────────────────
/** Save a place, mark it "Never again" (hidden from your recommendations; hosts and groups get a heads-up), or clear it. */
export async function setPlaceList(form: FormData) {
  const back2 = String(form.get("back") ?? "");
  const to = /^\/(venue\/[a-z0-9-]{1,80}|profile\/[A-Za-z0-9_.-]{1,40}|eat)(\?[^\s]*)?$/.test(back2) ? back2 : "/eat";
  await requireViewer(to);
  const p = z.object({ business: z.uuid(), list: z.enum(["saved", "never", "clear"]), note: optText(200) }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_place_list", { p_business: p.data.business, p_list: p.data.list === "clear" ? null : p.data.list, p_note: p.data.note ?? null });
  if (error) log.warn("places.list_failed", { code: error.code });
  revalidatePath("/eat");
  revalidatePath(to.split("?")[0]!);
  redirect(to);
}
