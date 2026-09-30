import "server-only";
import { isPaidPlan, periodEnd, planFromPrice, type Interval, type PaidPlan } from "@/domain/billing/stripe";
import { ensurePrice, stripeApi, type StripeApi } from "@/integrations/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/server/env";

/** Stripe is on when BILLING_PROVIDER=stripe and the secret key is set. */
export function billingEnabled(): boolean {
  return serverEnv.BILLING_PROVIDER === "stripe" && !!serverEnv.STRIPE_SECRET_KEY;
}
function api(): StripeApi {
  if (!serverEnv.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  return stripeApi(serverEnv.STRIPE_SECRET_KEY);
}

export type MyBilling = { hasCustomer: boolean; stripePlan: PaidPlan | null; pastDue: boolean; renews: string | null };

export async function getMyBilling(): Promise<MyBilling> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_billing");
  const d = (data ?? {}) as { has_customer?: boolean; stripe_plan?: string | null; past_due?: boolean; renews?: string | null };
  return { hasCustomer: !!d.has_customer, stripePlan: isPaidPlan(d.stripe_plan) ? d.stripe_plan : null, pastDue: !!d.past_due, renews: d.renews ?? null };
}

/** The person's Stripe customer, created the first time they check out. */
async function customerFor(user: { id: string; email: string | null }): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("stripe_customers").select("customer_id").eq("user_id", user.id).maybeSingle();
  if (data?.customer_id) return data.customer_id as string;
  const c = await api().post<{ id: string }>("customers", { email: user.email ?? undefined, metadata: { user_id: user.id } });
  const { error } = await admin.from("stripe_customers").insert({ user_id: user.id, customer_id: c.id });
  if (error) {
    // Two tabs at once: keep whichever was saved first.
    const again = await admin.from("stripe_customers").select("customer_id").eq("user_id", user.id).maybeSingle();
    if (again.data?.customer_id) return again.data.customer_id as string;
    throw error;
  }
  return c.id;
}

export async function createCheckout(user: { id: string; email: string | null }, plan: PaidPlan, interval: Interval, site: string): Promise<string> {
  const stripe = api();
  const [price, customer] = await Promise.all([ensurePrice(stripe, plan, interval), customerFor(user)]);
  const session = await stripe.post<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { user_id: user.id, plan } },
    metadata: { user_id: user.id, plan },
    success_url: `${site}/pricing?checkout=success`,
    cancel_url: `${site}/pricing?checkout=canceled`,
  });
  return session.url;
}

export async function createPortal(user: { id: string; email: string | null }, site: string): Promise<string> {
  const customer = await customerFor(user);
  const portal = await api().post<{ url: string }>("billing_portal/sessions", { customer, return_url: `${site}/pricing` });
  return portal.url;
}

type StripeSub = {
  id: string; status: string; customer: string; metadata?: Record<string, string>;
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null; price?: { lookup_key?: string | null; metadata?: Record<string, string> } }[] };
};

/** Webhook: re-read the subscription from Stripe (so event order never matters) and save its state. */
export async function syncSubscription(subscriptionId: string): Promise<void> {
  const sub = await api().get<StripeSub>(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  const admin = createAdminClient();
  let userId = sub.metadata?.user_id ?? null;
  if (!userId) {
    const { data } = await admin.from("stripe_customers").select("user_id").eq("customer_id", sub.customer).maybeSingle();
    userId = (data?.user_id as string | undefined) ?? null;
  }
  const plan = planFromPrice(sub.items?.data?.[0]?.price) ?? (isPaidPlan(sub.metadata?.plan) ? sub.metadata.plan : null);
  if (!userId || !plan) return;   // not a VYBR8 subscription
  const { error } = await admin.rpc("billing_apply_stripe_subscription", {
    p_user: userId, p_plan: plan, p_status: sub.status, p_ref: sub.id, p_period_end: periodEnd(sub),
  });
  if (error) throw error;
}
