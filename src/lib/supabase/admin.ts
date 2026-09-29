import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/config/public-env";
import { serverEnv } from "@/server/env";

/**
 * Secret-key client. BYPASSES Row Level Security.
 * Use only for trusted server jobs: Stripe webhooks, ranking recompute, admin tooling.
 * Never call from code paths that act on behalf of a user's request without an explicit authorization check.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return createSupabaseClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
