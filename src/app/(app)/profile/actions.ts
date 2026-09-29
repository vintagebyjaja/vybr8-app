"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

const schema = z.object({ userId: z.uuid(), username: z.string().max(30) });

export async function follow(form: FormData) {
  const { userId, username } = schema.parse(Object.fromEntries(form));
  const viewer = await requireViewer(`/profile/${username}`);
  const supabase = await createClient();
  await supabase.from("follows").insert({ follower_id: viewer.id, followee_id: userId });
  revalidatePath(`/profile/${username}`);
}

export async function unfollow(form: FormData) {
  const { userId, username } = schema.parse(Object.fromEntries(form));
  const viewer = await requireViewer(`/profile/${username}`);
  const supabase = await createClient();
  await supabase.from("follows").delete().eq("follower_id", viewer.id).eq("followee_id", userId);
  revalidatePath(`/profile/${username}`);
}
