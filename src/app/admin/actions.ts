"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";
import { log } from "@/server/log";

const decision = z.object({
  claimId: z.uuid(),
  note: z.string().trim().max(500).optional(),
});

// Defense in depth: the server re-checks admin here, and the database RPC checks again.
export async function approveClaim(form: FormData) {
  const admin = await requireAdmin();
  const { claimId, note } = decision.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_business_claim", { p_claim_id: claimId, p_note: note || null });
  if (error) log.warn("admin.approve_claim_failed", { claimId, adminId: admin.id, code: error.code });
  revalidatePath("/admin");
}

export async function rejectClaim(form: FormData) {
  const admin = await requireAdmin();
  const { claimId, note } = decision.parse(Object.fromEntries(form));
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_business_claim", { p_claim_id: claimId, p_note: note || "Could not verify ownership" });
  if (error) log.warn("admin.reject_claim_failed", { claimId, adminId: admin.id, code: error.code });
  revalidatePath("/admin");
}
