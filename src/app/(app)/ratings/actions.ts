"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { safeNext } from "@/server/safe-redirect";

/** Rating is always free. The database re-checks the item is visible (and 21+ for alcohol). */
const itemSchema = z.object({ itemId: z.uuid(), score: z.coerce.number().min(0).max(10), note: z.string().trim().max(500).optional(), returnTo: z.string().optional() });

export async function rateItem(form: FormData): Promise<void> {
  const parsed = itemSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { itemId, score, note, returnTo } = parsed.data;
  const viewer = await requireViewer(safeNext(returnTo, "/"));
  const supabase = await createClient();
  await supabase.from("item_ratings").upsert(
    { menu_item_id: itemId, user_id: viewer.id, score: Math.round(score * 10) / 10, note: note || null },
    { onConflict: "menu_item_id,user_id" },
  );
  revalidatePath(safeNext(returnTo, "/"));
}

const placeSchema = z.object({
  businessId: z.uuid(),
  overall: z.coerce.number().min(0).max(10),
  service_vybe: z.coerce.number().min(0).max(10).optional(),
  value: z.coerce.number().min(0).max(10).optional(),
  aesthetic: z.coerce.number().min(0).max(10).optional(),
  note: z.string().trim().max(1000).optional(),
  returnTo: z.string().optional(),
});

export async function ratePlace(form: FormData): Promise<void> {
  const parsed = placeSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const p = parsed.data;
  const viewer = await requireViewer(safeNext(p.returnTo, "/"));
  const supabase = await createClient();
  await supabase.from("place_ratings").upsert(
    { business_id: p.businessId, user_id: viewer.id, overall: p.overall, service_vybe: p.service_vybe ?? null, value: p.value ?? null, aesthetic: p.aesthetic ?? null, note: p.note || null },
    { onConflict: "business_id,user_id" },
  );
  revalidatePath(safeNext(p.returnTo, "/"));
}
