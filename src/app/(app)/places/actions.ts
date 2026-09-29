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
