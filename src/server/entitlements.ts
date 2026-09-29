import "server-only";
import { cache } from "react";
import type { Entitlement } from "@/domain/plans/plans";
import { createClient } from "@/lib/supabase/server";

/**
 * The one place the app asks "can this person use X?". The answer comes from the database
 * (plans + subscriptions), and the database checks again inside every gated function.
 * Never compare plan names in components.
 */
export type PlanInfo = { plan: "free" | "plus" | "max"; entitlements: Set<string>; staff: boolean };

export const getPlan = cache(async (): Promise<PlanInfo> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_plan");
  const d = (data ?? {}) as { plan?: string; entitlements?: string[]; staff?: boolean };
  return {
    plan: (d.plan === "plus" || d.plan === "max" ? d.plan : "free"),
    entitlements: new Set(d.entitlements ?? []),
    staff: !!d.staff,
  };
});

export async function can(entitlement: Entitlement): Promise<boolean> {
  const p = await getPlan();
  return p.staff || p.entitlements.has(entitlement);
}

// Named checks used across the app.
export const canUseDeepDive = () => can("deep_dive");
export const canUseGoalImpact = () => can("goal_impact");
export const canUseAdvancedGroupVybe = () => can("advanced_group_vybe");
export const canUseAdvancedNutrition = () => can("advanced_nutrition");

/** Business plan checks (for the business's own team). */
export async function businessCan(businessId: string, entitlement: Entitlement): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_plan_info", { p_business: businessId });
  if (error || !data) return false;
  return ((data as { entitlements?: string[] }).entitlements ?? []).includes(entitlement);
}
export const canViewBusinessAdvancedAnalytics = (businessId: string) => businessCan(businessId, "business_advanced_analytics");
export const canManageCampaigns = (businessId: string) => businessCan(businessId, "campaign_tools");
