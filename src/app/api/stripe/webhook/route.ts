import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/domain/billing/stripe";
import { serverEnv } from "@/server/env";
import { syncSubscription } from "@/server/billing";

export const dynamic = "force-dynamic";

/**
 * Stripe → VYBR8. Stripe signs every call with the webhook secret; anything unsigned is rejected.
 * Events to send (Stripe Dashboard → Developers → Webhooks):
 *   checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(req: Request) {
  const secret = serverEnv.STRIPE_WEBHOOK_SECRET;
  if (!secret || !serverEnv.STRIPE_SECRET_KEY) return NextResponse.json({ error: "payments are not set up" }, { status: 503 });

  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as { type: string; data: { object: { id?: string; object?: string; subscription?: string | null } } };
  const obj = event.data.object;
  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") subscriptionId = obj.subscription ?? null;
  else if (event.type.startsWith("customer.subscription.")) subscriptionId = obj.id ?? null;

  if (subscriptionId) {
    try {
      await syncSubscription(subscriptionId);
    } catch (e) {
      console.error("stripe webhook", event.type, e);
      return NextResponse.json({ error: "try again" }, { status: 500 });   // Stripe retries
    }
  }
  return NextResponse.json({ received: true });
}
