"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cityTimeToDate } from "@/domain/linkups/linkups";
import { findCity } from "@/domain/map/map";
import { GROUP_KIND_KEYS, parseList, type GroupKind } from "@/domain/groups/groups";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { log } from "@/server/log";

/** Friendly wording for database rules ("dating groups are for people 18 and older" etc.). */
function friendly(msg: string | undefined) {
  if (!msg || /violates|syntax|permission denied|duplicate/i.test(msg)) return "That didn't work. Try again.";
  return msg.charAt(0).toUpperCase() + msg.slice(1) + (msg.endsWith(".") ? "" : ".");
}
const back = (path: string, err?: string | null) => redirect(err ? `${path}${path.includes("?") ? "&" : "?"}e=${encodeURIComponent(err)}` : path);
const uuid = z.uuid();

// ── Groups ─────────────────────────────────────────────────────────────
export async function createGroup(form: FormData) {
  const viewer = await requireViewer("/groups");
  const p = z.object({ name: z.string().trim().min(2).max(60), kind: z.enum(GROUP_KIND_KEYS as [GroupKind, ...GroupKind[]]), description: z.string().trim().max(280).optional(), city: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!p.success) back("/groups", "Give your group a name (2–60 characters).");
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups")
    .insert({ owner_id: viewer.id, name: p.data!.name, kind: p.data!.kind, description: p.data!.description || null, city_slug: findCity(p.data!.city).slug })
    .select("id").single();
  if (error || !data) { log.warn("groups.create_failed", { code: error?.code }); back("/groups", friendly(error?.message)); }
  revalidatePath("/groups");
  redirect(`/groups/${data!.id}?new=1`);
}

export async function deleteGroup(form: FormData) {
  await requireViewer("/groups");
  const id = uuid.parse(form.get("group"));
  const supabase = await createClient();
  await supabase.from("groups").delete().eq("id", id);
  revalidatePath("/groups");
  redirect("/groups");
}

export async function inviteToGroup(form: FormData) {
  const viewer = await requireViewer("/groups");
  const p = z.object({ group: uuid, username: z.string().trim().transform((u) => u.replace(/^@/, "")).pipe(z.string().min(3).max(30)), relationship: z.string() }).safeParse(Object.fromEntries(form));
  const path = `/groups/${form.get("group")}`;
  if (!p.success) back(path, "Enter their VYBR8 username.");
  const supabase = await createClient();
  const { data: who } = await supabase.from("profiles").select("id").eq("username", p.data!.username).maybeSingle();
  if (!who) back(path, `No one on VYBR8 is @${p.data!.username}. For kids without the app, use "Add a kid".`);
  if (who!.id === viewer.id) back(path, "You're already in this group.");
  const { error } = await supabase.from("group_members").insert({ group_id: p.data!.group, user_id: who!.id, relationship: p.data!.relationship, invited_by: viewer.id, status: "invited" });
  revalidatePath(path);
  back(path, error ? (error.code === "23505" ? "They're already invited." : friendly(error.message)) : null);
}

export async function respondToInvite(form: FormData) {
  const viewer = await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const supabase = await createClient();
  if (form.get("accept") === "1") await supabase.from("group_members").update({ status: "active" }).eq("group_id", group).eq("user_id", viewer.id);
  else await supabase.from("group_members").delete().eq("group_id", group).eq("user_id", viewer.id);
  revalidatePath("/groups");
  redirect(form.get("accept") === "1" ? `/groups/${group}` : "/groups");
}

export async function leaveGroup(form: FormData) {
  const viewer = await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const supabase = await createClient();
  await supabase.from("group_members").delete().eq("group_id", group).eq("user_id", viewer.id);
  revalidatePath("/groups");
  redirect("/groups");
}

export async function removeMember(form: FormData) {
  await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const member = uuid.parse(form.get("member"));
  const supabase = await createClient();
  await supabase.from("group_members").delete().eq("id", member).eq("group_id", group);
  revalidatePath(`/groups/${group}`);
}

export async function setRelationship(form: FormData) {
  await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const p = z.object({ member: uuid, relationship: z.string().max(20) }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("group_members").update({ relationship: p.data.relationship }).eq("id", p.data.member);
  revalidatePath(`/groups/${group}`);
}

export async function makeAdmin(form: FormData) {
  await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const member = uuid.parse(form.get("member"));
  const supabase = await createClient();
  await supabase.from("group_members").update({ role: form.get("role") === "member" ? "member" : "admin" }).eq("id", member);
  revalidatePath(`/groups/${group}`);
}

// ── Kids ───────────────────────────────────────────────────────────────
const kidSchema = z.object({
  first_name: z.string().trim().min(1).max(40),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  likes: z.string().max(600).optional(), dislikes: z.string().max(600).optional(), allergies: z.string().max(400).optional(), dietary: z.string().max(200).optional(),
  group: z.string().optional(), relationship: z.string().optional(),
});

export async function addKid(form: FormData) {
  const viewer = await requireViewer("/groups");
  const p = kidSchema.safeParse(Object.fromEntries(form));
  const returnTo = typeof form.get("returnTo") === "string" ? String(form.get("returnTo")) : "/groups";
  if (!p.success) back(returnTo, "Add their first name.");
  const k = p.data!;
  const supabase = await createClient();
  const { data, error } = await supabase.from("dependents").insert({ first_name: k.first_name, birthdate: k.birthdate || null, created_by: viewer.id }).select("id").single();
  if (error || !data) { log.warn("groups.add_kid_failed", { code: error?.code }); back(returnTo, friendly(error?.message)); }
  await supabase.from("taste_profiles").insert({
    dependent_id: data!.id, likes: parseList(k.likes), dislikes: parseList(k.dislikes), allergies: parseList(k.allergies, 15), dietary: parseList(k.dietary, 10), kids_menu: true,
  });
  if (k.group && uuid.safeParse(k.group).success) {
    await supabase.from("group_members").insert({ group_id: k.group, dependent_id: data!.id, status: "active", relationship: k.relationship || "child", invited_by: viewer.id });
  }
  revalidatePath(returnTo);
  back(returnTo);
}

export async function addKidToGroup(form: FormData) {
  const viewer = await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const kid = uuid.parse(form.get("kid"));
  const supabase = await createClient();
  const { error } = await supabase.from("group_members").insert({ group_id: group, dependent_id: kid, status: "active", relationship: String(form.get("relationship") || "child"), invited_by: viewer.id });
  revalidatePath(`/groups/${group}`);
  back(`/groups/${group}`, error ? friendly(error.message) : null);
}

export async function updateKid(form: FormData) {
  await requireViewer("/groups");
  const id = uuid.parse(form.get("kid"));
  const p = kidSchema.safeParse(Object.fromEntries(form));
  if (!p.success) back(`/groups/kids/${id}`, "Check the name and birthday.");
  const supabase = await createClient();
  await supabase.from("dependents").update({ first_name: p.data!.first_name, birthdate: p.data!.birthdate || null }).eq("id", id);
  revalidatePath(`/groups/kids/${id}`);
  back(`/groups/kids/${id}?saved=1`);
}

export async function removeKid(form: FormData) {
  await requireViewer("/groups");
  const id = uuid.parse(form.get("kid"));
  const supabase = await createClient();
  await supabase.from("dependents").delete().eq("id", id);
  revalidatePath("/groups");
  redirect("/groups");
}

export async function addCoParent(form: FormData) {
  await requireViewer("/groups");
  const kid = uuid.parse(form.get("kid"));
  const user = uuid.parse(form.get("user"));
  const supabase = await createClient();
  const { error } = await supabase.from("dependent_guardians").insert({ dependent_id: kid, user_id: user });
  back(`/groups/kids/${kid}`, error ? "They need to be in a group with you first." : null);
}

/** One-time code so the kid can take over their profile at 13+. Shown once, never stored in plain text. */
export async function createTransferCode(kidId: string): Promise<{ code?: string; error?: string }> {
  await requireViewer("/groups");
  const id = uuid.parse(kidId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_dependent_transfer", { p_dependent: id });
  if (error || !data) return { error: friendly(error?.message) };
  return { code: String(data).toUpperCase().match(/.{1,6}/g)!.join("-") };
}

export async function redeemTransferCode(form: FormData) {
  await requireViewer("/groups/claim");
  const code = String(form.get("code") ?? "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (code.length < 20) back("/groups/claim", "Check the code and try again.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_dependent_transfer", { p_token: code });
  if (error) back("/groups/claim", friendly(error.message));
  revalidatePath("/groups");
  redirect("/groups?claimed=1");
}

// ── Tastes ─────────────────────────────────────────────────────────────
const tasteSchema = z.object({
  likes: z.string().max(600).optional(), dislikes: z.string().max(600).optional(), allergies: z.string().max(400).optional(), dietary: z.string().max(200).optional(),
  spice: z.coerce.number().int().min(0).max(4).optional(), notes: z.string().trim().max(280).optional(), kids_menu: z.literal("on").optional(),
  kid: z.string().optional(), returnTo: z.string().optional(),
});

export async function saveTaste(form: FormData) {
  const viewer = await requireViewer("/groups");
  const p = tasteSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  const returnTo = typeof form.get("returnTo") === "string" && String(form.get("returnTo")).startsWith("/groups") ? String(form.get("returnTo")) : "/groups";
  if (!p.success) back(returnTo, "Check your tastes and try again.");
  const t = p.data!;
  const row = {
    likes: parseList(t.likes), dislikes: parseList(t.dislikes), allergies: parseList(t.allergies, 15), dietary: parseList(t.dietary, 10),
    spice: t.spice ?? null, notes: t.notes || null, kids_menu: t.kids_menu === "on", updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const kid = t.kid && uuid.safeParse(t.kid).success ? t.kid : null;
  const { data: existing } = await supabase.from("taste_profiles").select("id").eq(kid ? "dependent_id" : "user_id", kid ?? viewer.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("taste_profiles").update(row).eq("id", existing.id)
    : await supabase.from("taste_profiles").insert({ ...row, ...(kid ? { dependent_id: kid } : { user_id: viewer.id }) });
  revalidatePath(returnTo);
  back(returnTo.includes("saved=1") ? returnTo : `${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=1`, error ? friendly(error.message) : null);
}

// ── Plans (date nights, family dinners) ────────────────────────────────
export async function createPlan(form: FormData) {
  const viewer = await requireViewer("/groups");
  const p = z.object({ group: uuid, title: z.string().trim().min(2).max(80), date: z.string().optional(), time: z.string().optional(), venue: z.string().optional(), notes: z.string().trim().max(500).optional(), city: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  const path = `/groups/${form.get("group")}`;
  if (!p.success) back(path, "Give the plan a name.");
  const supabase = await createClient();
  let businessId: string | null = null;
  if (p.data!.venue) {
    const { data } = await supabase.from("businesses").select("id").eq("slug", p.data!.venue).maybeSingle();
    businessId = (data?.id as string | undefined) ?? null;
  }
  const when = p.data!.date ? cityTimeToDate(`${p.data!.date}T${p.data!.time || "19:00"}`, findCity(p.data!.city).timezone) : null;
  const { error } = await supabase.from("group_plans").insert({
    group_id: p.data!.group, title: p.data!.title, business_id: businessId, notes: p.data!.notes || null,
    planned_for: when && Number.isFinite(when.getTime()) ? when.toISOString() : null, created_by: viewer.id,
  });
  revalidatePath(path);
  back(`${path}#plans`, error ? friendly(error.message) : null);
}

export async function setPlanStatus(form: FormData) {
  await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const plan = uuid.parse(form.get("plan"));
  const status = z.enum(["idea", "planned", "done", "cancelled"]).parse(form.get("status"));
  const supabase = await createClient();
  await supabase.from("group_plans").update({ status }).eq("id", plan);
  revalidatePath(`/groups/${group}`);
}

export async function addPick(form: FormData) {
  const viewer = await requireViewer("/groups");
  const p = z.object({ group: uuid, plan: uuid, member: uuid, item: uuid, note: z.string().trim().max(140).optional() }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("group_plan_picks").insert({ plan_id: p.data.plan, member_id: p.data.member, menu_item_id: p.data.item, note: p.data.note || null, added_by: viewer.id });
  revalidatePath(`/groups/${p.data.group}`);
  back(`/groups/${p.data.group}#plan-${p.data.plan}`, error && error.code !== "23505" ? "That pick isn't available for them." : null);
}

export async function removePick(form: FormData) {
  await requireViewer("/groups");
  const group = uuid.parse(form.get("group"));
  const pick = uuid.parse(form.get("pick"));
  const supabase = await createClient();
  await supabase.from("group_plan_picks").delete().eq("id", pick);
  revalidatePath(`/groups/${group}`);
}
