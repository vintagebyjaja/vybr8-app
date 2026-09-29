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
