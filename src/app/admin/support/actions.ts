"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";
import { log } from "@/server/log";

// Defense in depth: the server re-checks the team role here, and the database policy checks again.
export async function updateTicket(form: FormData) {
  const staff = await requireStaff();
  const p = z.object({
    id: z.uuid(),
    status: z.enum(["open", "answered", "closed"]),
    note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(2000).optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets")
    .update({ status: p.data.status, ...(p.data.note !== undefined ? { staff_note: p.data.note } : {}) })
    .eq("id", p.data.id);
  if (error) log.warn("support.update_failed", { staffId: staff.id, code: error.code });
  revalidatePath("/admin/support");
}
