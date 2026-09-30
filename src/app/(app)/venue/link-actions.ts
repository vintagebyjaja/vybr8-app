"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LINK_KINDS } from "@/domain/places/links";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

const back = z.string().regex(/^\/(venue|food-trucks)\/[a-z0-9-]{1,80}$/);
const human = (m: string) => (/^(That|Only|The |Sign in)/.test(m) ? m : "That link didn't save. Check it and try again.");
const go = (path: string, params: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(params)}#links`);

/** Add a menu / social / delivery / reservation link. The database checks the domain and who can set what. */
export async function addPlaceLink(form: FormData) {
  const p = z.object({ business: z.uuid(), kind: z.enum(LINK_KINDS as [string, ...string[]]), url: z.string().trim().min(3).max(400), back }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  await requireViewer(p.data.back);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_place_link", { p_business: p.data.business, p_kind: p.data.kind, p_url: p.data.url });
  if (error) go(p.data.back, { link_error: human(error.message) });
  revalidatePath(p.data.back);
  go(p.data.back, { link_saved: "1" });
}

export async function removePlaceLink(form: FormData) {
  const p = z.object({ business: z.uuid(), kind: z.enum(LINK_KINDS as [string, ...string[]]), back }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  await requireViewer(p.data.back);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_place_link", { p_business: p.data.business, p_kind: p.data.kind });
  if (error) go(p.data.back, { link_error: human(error.message) });
  revalidatePath(p.data.back);
  go(p.data.back, {});
}
