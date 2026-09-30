"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

/** Save or unsave a menu item ("I want this again"). Owner-only table; RLS enforces it. */
export async function toggleSavedItem(form: FormData) {
  const p = z.object({ item: z.uuid(), saved: z.enum(["0", "1"]), back: z.string().startsWith("/cravezone").max(600) }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const viewer = await requireViewer(p.data.back);
  const supabase = await createClient();
  if (p.data.saved === "1") await supabase.from("saved_menu_items").delete().eq("user_id", viewer.id).eq("menu_item_id", p.data.item);
  else await supabase.from("saved_menu_items").insert({ menu_item_id: p.data.item });
  revalidatePath("/cravezone/results");
}
