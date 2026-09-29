"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

/** Point the profile at a photo the user just uploaded to their own avatars folder. The database re-checks the path. */
export async function setProfilePhoto(path: string): Promise<string | null> {
  const viewer = await requireViewer("/profile/settings");
  if (!new RegExp(`^${viewer.id}/[A-Za-z0-9._-]{1,120}$`).test(path)) return "Invalid photo.";
  const supabase = await createClient();
  const { data: old } = await supabase.from("profiles").select("avatar_url").eq("id", viewer.id).single();
  const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", viewer.id);
  if (error) return "Could not save your photo.";
  const prev = old?.avatar_url as string | null;
  if (prev && prev.startsWith(`${viewer.id}/`) && prev !== path) await supabase.storage.from("avatars").remove([prev]);
  revalidatePath("/", "layout");
  return null;
}
