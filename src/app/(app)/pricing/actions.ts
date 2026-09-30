"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isInterval, isPaidPlan } from "@/domain/billing/stripe";
import { publicEnv } from "@/config/public-env";
import { getViewer } from "@/server/auth";
import { billingEnabled, createCheckout, createPortal, getMyBilling } from "@/server/billing";

async function siteUrl(): Promise<string> {
  const configured = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (!configured.includes("localhost")) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

/** Upgrade: sends them to Stripe's secure checkout page. */
export async function startCheckout(form: FormData) {
  const plan = form.get("plan");
  const interval = form.get("interval");
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in?next=/pricing");
  if (!isPaidPlan(plan) || !isInterval(interval)) redirect("/pricing?checkout=error");
  if (!billingEnabled()) redirect("/pricing?checkout=soon");

  // Already paying? Change plans in the billing portal instead of starting a second subscription.
  const billing = await getMyBilling();
  let url: string;
  try {
    const site = await siteUrl();
    url = billing.stripePlan ? await createPortal(viewer, site) : await createCheckout(viewer, plan, interval, site);
  } catch (e) {
    console.error("checkout", e);
    redirect("/pricing?checkout=error");
  }
  redirect(url);
}

/** Manage billing: change plan, update card, see receipts, cancel. */
export async function openBillingPortal() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in?next=/pricing");
  if (!billingEnabled()) redirect("/pricing?checkout=soon");
  let url: string;
  try {
    url = await createPortal(viewer, await siteUrl());
  } catch (e) {
    console.error("billing portal", e);
    redirect("/pricing?checkout=portal_error");
  }
  redirect(url);
}
