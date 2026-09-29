"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cityDay, cityTimeToDate, is21OnDay, OCCASIONS, validateLinkupDraft } from "@/domain/linkups/linkups";
import { CITIES, findCity } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getLinkup, toChat, type ChatMessage } from "@/server/linkups";
import { log } from "@/server/log";

export type FormState = { errors?: string[] };

const draftSchema = z.object({
  title: z.string().trim(),
  occasion: z.string(),
  city: z.string(),
  venue: z.string().trim().optional(),
  meet_point: z.string().trim().max(120).optional(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  capacity: z.coerce.number().int(),
  visibility: z.string(),
  join_mode: z.string(),
  open_to_new_friends: z.string().optional(),
  is_alcoholic: z.string().optional(),
  description: z.string().trim().max(1000).optional(),
});

/** Friendly wording for errors raised by the database rules. */
function friendly(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  if (/violates|duplicate|syntax|permission denied/i.test(message)) return "That didn't go through. Try again.";
  return message.charAt(0).toUpperCase() + message.slice(1) + (message.endsWith(".") ? "" : ".");
}

export async function createLinkup(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/vybe/new");
  const parsed = draftSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: ["Fill in the highlighted fields."] };
  const f = parsed.data;
  const city = findCity(f.city);
  const supabase = await createClient();

  let businessId: string | null = null;
  if (f.venue) {
    const { data } = await supabase.from("businesses").select("id").eq("slug", f.venue).maybeSingle();
    businessId = (data?.id as string | undefined) ?? null;
  }
  const startsAt = cityTimeToDate(`${f.date}T${f.start}`, city.timezone);
  let endsAt = cityTimeToDate(`${f.date}T${f.end}`, city.timezone);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000); // ends after midnight
  const hostIs21OnDay = viewer.is21Plus || (!!viewer.birthdate && Number.isFinite(startsAt.getTime()) && is21OnDay(viewer.birthdate, cityDay(startsAt, city.timezone)));
  const isAlcoholic = f.is_alcoholic === "on" && hostIs21OnDay;

  const errors = validateLinkupDraft(
    {
      title: f.title, occasion: f.occasion, citySlug: f.city, businessId, meetPoint: f.meet_point || null,
      startsAt, endsAt, capacity: f.capacity, visibility: f.visibility, joinMode: f.join_mode,
      isAlcoholic: f.is_alcoholic === "on", description: f.description || null,
    },
    { now: new Date(), hostIs21OnDay, cities: CITIES.map((c) => c.slug) },
  );
  if (errors.length) return { errors };

  const { data, error } = await supabase
    .from("linkups")
    .insert({
      title: f.title, occasion: f.occasion as keyof typeof OCCASIONS, city_slug: city.slug, business_id: businessId,
      meet_point: businessId ? null : f.meet_point, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      capacity: f.capacity, visibility: f.visibility, join_mode: f.join_mode,
      open_to_new_friends: f.open_to_new_friends === "on", is_alcoholic: isAlcoholic, description: f.description || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    log.warn("linkup.create_failed", { userId: viewer.id, code: error?.code });
    return { errors: [friendly(error?.message)] };
  }
  revalidatePath("/vybe");
  revalidatePath("/");
  redirect(`/vybe/${data.id}?new=1`);
}

const id = z.uuid();
const pair = z.object({ linkup: z.uuid(), user: z.uuid() });

async function run(linkupId: string, fn: string, args: Record<string, unknown>) {
  const viewer = await requireViewer(`/vybe/${linkupId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) log.warn(`linkup.${fn}_failed`, { userId: viewer.id, linkupId, code: error.code });
  revalidatePath(`/vybe/${linkupId}`);
  revalidatePath("/vybe");
  revalidatePath("/");
  return error ? friendly(error.message) : null;
}

export async function joinLinkup(form: FormData) {
  const l = id.parse(form.get("linkup"));
  await run(l, "join_linkup", { p_linkup: l });
}
export async function leaveLinkup(form: FormData) {
  const l = id.parse(form.get("linkup"));
  await run(l, "leave_linkup", { p_linkup: l });
}
export async function approveRequest(form: FormData) {
  const p = pair.parse(Object.fromEntries(form));
  await run(p.linkup, "respond_to_request", { p_linkup: p.linkup, p_user: p.user, p_approve: form.get("approve") === "1" });
}
export async function removeMember(form: FormData) {
  const p = pair.parse(Object.fromEntries(form));
  await run(p.linkup, "remove_member", { p_linkup: p.linkup, p_user: p.user });
}
export async function inviteFriend(form: FormData) {
  const p = pair.parse(Object.fromEntries(form));
  await run(p.linkup, "invite_to_linkup", { p_linkup: p.linkup, p_user: p.user });
}
export async function revokeGuestInvite(form: FormData) {
  const l = id.parse(form.get("linkup"));
  await run(l, "revoke_guest_invite", { p_invite: id.parse(form.get("invite")) });
}

export async function cancelLinkup(form: FormData) {
  const l = id.parse(form.get("linkup"));
  const viewer = await requireViewer(`/vybe/${l}`);
  const supabase = await createClient();
  const { error } = await supabase.from("linkups").update({ status: "cancelled" }).eq("id", l).eq("host_id", viewer.id);
  if (error) log.warn("linkup.cancel_failed", { userId: viewer.id, linkupId: l, code: error.code });
  revalidatePath("/vybe");
  revalidatePath("/");
  redirect("/vybe");
}

/** Create a guest link for someone who isn't on VYBR8. The token is only shown once. */
export async function createGuestLink(linkupId: string, label: string): Promise<{ url?: string; error?: string }> {
  const l = id.parse(linkupId);
  const viewer = await requireViewer(`/vybe/${l}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_guest_invite", { p_linkup: l, p_label: label.trim().slice(0, 60) || null });
  if (error || !data) {
    log.warn("linkup.guest_invite_failed", { userId: viewer.id, linkupId: l, code: error?.code });
    return { error: friendly(error?.message) };
  }
  revalidatePath(`/vybe/${l}`);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vybr8.live";
  return { url: `${site.replace(/\/$/, "")}/i/${data as string}` };
}

// ── Group chat (members) ──────────────────────────────────────────────
export async function loadChat(linkupId: string): Promise<ChatMessage[]> {
  const l = id.parse(linkupId);
  await requireViewer(`/vybe/${l}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("linkup_chat", { p_linkup: l });
  return toChat(data);
}

export async function sendChat(linkupId: string, body: string): Promise<string | null> {
  const l = id.parse(linkupId);
  const viewer = await requireViewer(`/vybe/${l}`);
  const text = body.trim().slice(0, 1000);
  if (!text) return null;
  const supabase = await createClient();
  const { error } = await supabase.from("linkup_messages").insert({ linkup_id: l, user_id: viewer.id, body: text });
  if (error) {
    const detail = await getLinkup(l, viewer);
    return detail?.isOver ? "The chat has closed." : "Couldn't send. Try again.";
  }
  return null;
}
