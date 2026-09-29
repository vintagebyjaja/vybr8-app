"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cityDay, cityTimeToDate } from "@/domain/linkups/linkups";
import { CITIES, findCity } from "@/domain/map/map";
import { addDays, liveExpiry, OPERATOR_STATUSES } from "@/domain/trucks/trucks";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";

const DASHBOARD = "/food-truck/dashboard";
const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const citySchema = z.enum(CITIES.map((c) => c.slug) as [string, ...string[]]);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optionalCoord = (min: number, max: number) =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const num = Number(v);
    if (!Number.isFinite(num) || num < min || num > max) {
      ctx.addIssue({ code: "custom", message: "Out of range" });
      return z.NEVER;
    }
    return Math.round(num * 1e6) / 1e6;
  });
const httpsUrl = z.string().trim().max(300).refine((v) => /^https:\/\/[^\s]+\.[^\s]+/.test(v), "Use a full https:// link");

function refresh(slug?: string | null) {
  revalidatePath("/food-trucks");
  if (slug) revalidatePath(`/food-trucks/${slug}`);
  revalidatePath(DASHBOARD);
  revalidatePath("/");
}

/** Send the operator back to the dashboard with a short, friendly note about what went wrong. */
function fail(slug: string | null, key: string): never {
  refresh(slug);
  redirect(`${DASHBOARD}?e=${key}${slug ? `#truck-${slug}` : ""}`);
}

const truckRef = z.object({ truck: z.uuid(), slug: slugSchema });

// ── Fans ──────────────────────────────────────────────────────────────

export async function followTruck(form: FormData) {
  const { truck, slug } = truckRef.parse(Object.fromEntries(form));
  const viewer = await requireViewer(`/food-trucks/${slug}`);
  const supabase = await createClient();
  const { error } = await supabase.from("food_truck_follows").upsert({ user_id: viewer.id, business_id: truck, notify: true }, { onConflict: "user_id,business_id", ignoreDuplicates: true });
  if (error) log.warn("trucks.follow_failed", { userId: viewer.id, truck, code: error.code });
  refresh(slug);
}

export async function unfollowTruck(form: FormData) {
  const { truck, slug } = truckRef.parse(Object.fromEntries(form));
  const viewer = await requireViewer(`/food-trucks/${slug}`);
  const supabase = await createClient();
  const { error } = await supabase.from("food_truck_follows").delete().eq("user_id", viewer.id).eq("business_id", truck);
  if (error) log.warn("trucks.unfollow_failed", { userId: viewer.id, truck, code: error.code });
  refresh(slug);
}

export async function setNotify(form: FormData) {
  const { truck, slug } = truckRef.parse(Object.fromEntries(form));
  const notify = form.get("notify") === "1";
  const viewer = await requireViewer(`/food-trucks/${slug}`);
  const supabase = await createClient();
  const { error } = await supabase.from("food_truck_follows").update({ notify }).eq("user_id", viewer.id).eq("business_id", truck);
  if (error) log.warn("trucks.notify_failed", { userId: viewer.id, truck, code: error.code });
  refresh(slug);
}

// ── Operators (RLS decides: only the truck's owners and managers can write) ──

const stopSchema = z.object({
  truck: z.uuid(),
  slug: slugSchema,
  location_name: z.string().trim().min(2).max(80),
  address: optionalText(160),
  lat: optionalCoord(-90, 90),
  lng: optionalCoord(-180, 180),
  city: citySchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  event_name: optionalText(80),
  status: z.enum(["scheduled", "open"]).default("scheduled"),
});

export async function addStop(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = stopSchema.safeParse(Object.fromEntries(form));
  const slug = slugSchema.safeParse(form.get("slug")).data ?? null;
  if (!parsed.success) fail(slug, "stop_fields");
  const f = parsed.data;
  const city = findCity(f.city);
  const startAt = cityTimeToDate(`${f.date}T${f.start}`, city.timezone);
  let endAt = cityTimeToDate(`${f.date}T${f.end}`, city.timezone);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000); // runs past midnight
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) fail(f.slug, "stop_time");
  if (endAt.getTime() - startAt.getTime() > 18 * 3_600_000) fail(f.slug, "stop_long");
  if (endAt.getTime() <= Date.now()) fail(f.slug, "stop_past");
  if ((f.lat == null) !== (f.lng == null)) fail(f.slug, "stop_coords");

  const supabase = await createClient();
  const { error } = await supabase.from("food_truck_schedules").insert({
    business_id: f.truck, location_name: f.location_name, address: f.address, latitude: f.lat, longitude: f.lng, city_slug: city.slug,
    start_at: startAt.toISOString(), end_at: endAt.toISOString(), event_name: f.event_name, status: f.status, source: "operator",
  });
  if (error) {
    log.warn("trucks.add_stop_failed", { userId: viewer.id, truck: f.truck, code: error.code });
    fail(f.slug, "not_allowed");
  }
  refresh(f.slug);
}

const stopRef = z.object({ stop: z.uuid(), slug: slugSchema });

export async function updateStopStatus(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = stopRef.extend({ status: z.enum(OPERATOR_STATUSES) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(null, "bad_request");
  const { stop, slug, status } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("food_truck_schedules").update({ status }).eq("id", stop).select("id");
  if (error || !data?.length) {
    log.warn("trucks.stop_status_failed", { userId: viewer.id, stop, code: error?.code });
    fail(slug, "not_allowed");
  }
  refresh(slug);
}

export async function deleteStop(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = stopRef.safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(null, "bad_request");
  const { stop, slug } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("food_truck_schedules").delete().eq("id", stop).select("id");
  if (error || !data?.length) {
    log.warn("trucks.delete_stop_failed", { userId: viewer.id, stop, code: error?.code });
    fail(slug, "not_allowed");
  }
  refresh(slug);
}

const liveSchema = z.object({
  truck: z.uuid(),
  slug: slugSchema,
  lat: optionalCoord(-90, 90),
  lng: optionalCoord(-180, 180),
  stop: z.union([z.uuid(), z.literal("")]).optional(),
  city: citySchema.optional(),
  note: optionalText(120),
  hours: z.coerce.number().int().min(1).max(8).default(4),
});

/** WE'RE HERE: a live pin from GPS, a typed spot, or one of today's stops. Turns off by itself after 1–8 hours. */
export async function goLive(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = liveSchema.safeParse(Object.fromEntries(form));
  const slug = slugSchema.safeParse(form.get("slug")).data ?? null;
  if (!parsed.success) fail(slug, "live_fields");
  const f = parsed.data;
  const supabase = await createClient();

  let lat = f.lat, lng = f.lng, citySlug: string | null = f.city ?? null;
  if ((lat == null || lng == null) && f.stop) {
    const { data: s } = await supabase.from("food_truck_schedules").select("latitude, longitude, city_slug").eq("id", f.stop).eq("business_id", f.truck).maybeSingle();
    if (s?.latitude != null && s.longitude != null) {
      lat = Number(s.latitude);
      lng = Number(s.longitude);
      citySlug = (s.city_slug as string | null) ?? citySlug;
    }
  }
  if (lat == null || lng == null) fail(f.slug, "live_where");

  const now = new Date();
  const { error } = await supabase.from("food_truck_live_status").upsert(
    { business_id: f.truck, latitude: lat, longitude: lng, city_slug: citySlug, note: f.note, started_at: now.toISOString(), expires_at: liveExpiry(f.hours, now).toISOString() },
    { onConflict: "business_id" },
  );
  if (error) {
    log.warn("trucks.go_live_failed", { userId: viewer.id, truck: f.truck, code: error.code });
    fail(f.slug, "not_allowed");
  }
  refresh(f.slug);
}

export async function endLive(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = truckRef.safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(null, "bad_request");
  const { truck, slug } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("food_truck_live_status").delete().eq("business_id", truck);
  if (error) {
    log.warn("trucks.end_live_failed", { userId: viewer.id, truck, code: error.code });
    fail(slug, "not_allowed");
  }
  refresh(slug);
}

/** Sold out for the rest of today (city time), or back on. */
export async function markSoldOut(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = z.object({ item: z.uuid(), slug: slugSchema, city: citySchema.optional(), sold_out: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(null, "bad_request");
  const { item, slug, city, sold_out } = parsed.data;
  const tz = findCity(city ?? null).timezone;
  const until = sold_out === "1" ? cityTimeToDate(`${addDays(cityDay(new Date(), tz), 1)}T00:00`, tz).toISOString() : null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("menu_items").update({ sold_out_until: until }).eq("id", item).select("id");
  if (error || !data?.length) {
    log.warn("trucks.sold_out_failed", { userId: viewer.id, item, code: error?.code });
    fail(slug, "not_allowed");
  }
  refresh(slug);
}

const itemSchema = z.object({
  truck: z.uuid(),
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  price: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const num = Number(v.replace(/^\$/, ""));
    if (!Number.isFinite(num) || num < 0 || num > 10_000) {
      ctx.addIssue({ code: "custom", message: "Price" });
      return z.NEVER;
    }
    return Math.round(num * 100);
  }),
  category: z.enum(["food", "drink"]),
  section: optionalText(60),
  dish_type: z.string().trim().toLowerCase().optional().transform((v) => (v ? v.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null))
    .refine((v) => v == null || /^[a-z0-9-]{2,40}$/.test(v), "Dish type"),
  description: optionalText(600),
});

export async function addMenuItem(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = itemSchema.safeParse(Object.fromEntries(form));
  const slug = slugSchema.safeParse(form.get("slug")).data ?? null;
  if (!parsed.success) fail(slug, "item_fields");
  const f = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("menu_items").insert({
    business_id: f.truck, name: f.name, price_cents: f.price, category: f.category, section: f.section, dish_type: f.dish_type,
    description: f.description, is_alcoholic: false,
  });
  if (error) {
    log.warn("trucks.add_item_failed", { userId: viewer.id, truck: f.truck, code: error.code });
    fail(f.slug, "not_allowed");
  }
  refresh(f.slug);
}

const profileSchema = z.object({
  truck: z.uuid(),
  slug: slugSchema,
  cuisine: optionalText(60),
  ordering_url: z.union([httpsUrl, z.literal("")]).optional().transform((v) => v || null),
  catering_available: z.string().optional().transform((v) => v === "on"),
  home_city_slug: z.union([citySchema, z.literal("")]).optional().transform((v) => v || null),
  social_1: z.union([httpsUrl, z.literal("")]).optional(),
  social_2: z.union([httpsUrl, z.literal("")]).optional(),
  social_3: z.union([httpsUrl, z.literal("")]).optional(),
});

export async function saveTruckProfile(form: FormData) {
  const viewer = await requireViewer(DASHBOARD);
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  const slug = slugSchema.safeParse(form.get("slug")).data ?? null;
  if (!parsed.success) fail(slug, "profile_fields");
  const f = parsed.data;
  const socials = [f.social_1, f.social_2, f.social_3].filter((u): u is string => !!u).map((url) => ({ url }));
  const supabase = await createClient();
  const { error } = await supabase.from("food_truck_profiles").upsert(
    { business_id: f.truck, cuisine: f.cuisine, ordering_url: f.ordering_url, catering_available: f.catering_available, home_city_slug: f.home_city_slug, socials, updated_at: new Date().toISOString() },
    { onConflict: "business_id" },
  );
  if (error) {
    log.warn("trucks.save_profile_failed", { userId: viewer.id, truck: f.truck, code: error.code });
    fail(f.slug, "not_allowed");
  }
  refresh(f.slug);
}
