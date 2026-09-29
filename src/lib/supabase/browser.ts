"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/config/public-env";

/** Supabase client for Client Components (realtime, optimistic UI). Uses the publishable key only. */
export function createClient() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
