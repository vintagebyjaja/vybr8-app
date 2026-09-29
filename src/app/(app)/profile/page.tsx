import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export default async function MyProfilePage() {
  const viewer = await requireViewer("/profile");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("username").eq("id", viewer.id).single();
  redirect(data ? `/profile/${data.username}` : "/profile/settings");
}
