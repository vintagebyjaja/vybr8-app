"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CITIES } from "@/domain/map/map";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

const citySlug = z.enum(CITIES.map((c) => c.slug) as [string, ...string[]]);

export async function setCity(slug: string) {
  const viewer = await requireViewer("/");
  const parsed = citySlug.safeParse(slug);
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("user_settings").update({ city_slug: parsed.data }).eq("user_id", viewer.id);
  revalidatePath("/");
  revalidatePath("/vybe");
}

const statusSchema = z.object({
  intent: z.enum(["eat", "drink", "link_up"]),
  city: citySlug,
  hours: z.coerce.number().int().min(1).max(12),
  note: z.string().trim().max(140).optional(),
});

/** "What's your vybe?" status: friends see it for up to 12 hours. */
export async function setVybeStatus(form: FormData) {
  const viewer = await requireViewer("/");
  const parsed = statusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const now = new Date();
  const supabase = await createClient();
  await supabase.from("vybe_statuses").upsert({
    user_id: viewer.id,
    intent: parsed.data.intent,
    city_slug: parsed.data.city,
    note: parsed.data.note || null,
    business_id: null,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + parsed.data.hours * 3_600_000).toISOString(),
  });
  revalidatePath("/");
}

export async function clearVybeStatus() {
  const viewer = await requireViewer("/");
  const supabase = await createClient();
  await supabase.from("vybe_statuses").delete().eq("user_id", viewer.id);
  revalidatePath("/");
}
