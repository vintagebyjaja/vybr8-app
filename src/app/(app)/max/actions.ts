"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scale, type Nutrients } from "@/domain/nutrition/nutrition";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/entitlements";

/** Log a menu item (MAKE IT WORK / I'M EATING IT ANYWAY). Basic food logging is free. */
export async function logMenuItem(form: FormData) {
  const parsed = z.object({ itemId: z.uuid(), portion: z.coerce.number().min(0.25).max(3) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { itemId, portion } = parsed.data;
  await requireViewer(`/max/deep-dive/${itemId}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("item_deep_dive", { p_item: itemId });
  const d = data as { item?: { name: string }; nutrition?: Record<string, number | null> & { source?: string } } | null;
  if (!d?.item) return;
  const n = scale((d.nutrition ?? {}) as Nutrients, portion);
  await supabase.from("food_logs").insert({
    menu_item_id: itemId, name: d.item.name, portion,
    calories: n.calories ?? null, protein_g: n.protein_g ?? null, carbs_g: n.carbs_g ?? null, fat_g: n.fat_g ?? null,
    sodium_mg: n.sodium_mg ?? null, sugar_g: n.sugar_g ?? null, fiber_g: n.fiber_g ?? null,
    nutrition_source: (d.nutrition?.source as string | undefined) ?? "unknown",
  });
  revalidatePath(`/max/deep-dive/${itemId}`);
}

const targetsSchema = z.object({
  itemId: z.uuid().optional(),
  goal: z.enum(["maintain", "weight_management", "muscle_gain", "performance", "custom"]),
  calories: z.coerce.number().int().min(800).max(8000),
  protein_g: z.coerce.number().int().min(0).max(500).optional(),
  sodium_mg: z.coerce.number().int().min(0).max(10000).optional(),
});

/** Custom nutrition targets are a VYBR8+ feature; checked on the server. */
export async function saveTargets(form: FormData) {
  const viewer = await requireViewer("/pricing");
  if (!(await can("custom_nutrition_targets"))) return;
  const parsed = targetsSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const { itemId, ...t } = parsed.data;
  const supabase = await createClient();
  await supabase.from("nutrition_targets").upsert({ user_id: viewer.id, ...t, updated_at: new Date().toISOString() });
  if (itemId) revalidatePath(`/max/deep-dive/${itemId}`);
}
