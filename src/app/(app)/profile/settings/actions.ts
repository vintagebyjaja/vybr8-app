"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

const vis = z.enum(["public", "friends", "private"]);

const schema = z.object({
  display_name: z.string().trim().max(60),
  bio: z.string().trim().max(280),
  home_city: z.string().trim().max(80),
  profile_visibility: vis,
  ratings_visibility: vis,
  saves_visibility: vis,
  taste_visibility: vis,
  activity_visibility: vis,
  dietary_visibility: vis,
  birthday_alerts: z.literal("on").optional(),
});

export async function saveSettings(form: FormData) {
  const viewer = await requireViewer("/profile/settings");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/profile/settings?error=invalid");

  const { display_name, bio, home_city, birthday_alerts, ...privacy } = parsed.data;
  const supabase = await createClient();

  // RLS limits both updates to the viewer's own rows; the id filter just makes intent explicit.
  const { data: settings } = await supabase.from("user_settings").select("notification_prefs").eq("user_id", viewer.id).single();
  const prefs = { ...((settings?.notification_prefs as Record<string, unknown>) ?? {}), birthday: birthday_alerts === "on" };
  const [n, p, s] = await Promise.all([
    supabase.from("user_settings").update({ notification_prefs: prefs }).eq("user_id", viewer.id),
    supabase.from("profiles").update({ display_name: display_name || null, bio: bio || null, home_city: home_city || null }).eq("id", viewer.id),
    supabase.from("privacy_settings").update(privacy).eq("user_id", viewer.id),
  ]);
  if (n.error || p.error || s.error) redirect("/profile/settings?error=save");

  revalidatePath("/profile", "layout");
  redirect("/profile/settings?saved=1");
}

/** Change your @username. The database checks every rule (taken, reserved, once every 30 days). */
export async function changeUsername(form: FormData) {
  await requireViewer("/profile/settings");
  const wanted = String(form.get("username") ?? "").trim().replace(/^@+/, "");
  const back = (params: Record<string, string>): never => redirect(`/profile/settings?${new URLSearchParams(params)}`);
  if (!/^[A-Za-z0-9_.]{3,30}$/.test(wanted)) back({ handle_error: "Use 3 to 30 letters, numbers, underscores or periods." });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_username", { p_new: wanted });
  if (error) back({ handle_error: /^(Use 3|Your @|That @|You can change|Sign in)/.test(error.message) ? error.message : /duplicate key/i.test(error.message) ? "That @ is taken. Try another." : "That didn't work. Try again." });
  revalidatePath("/profile", "layout");
  back({ handle: String(data ?? wanted) });
}
