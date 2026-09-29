/** Billing abstraction. Consumer and business subscriptions share the interface, not the plans. */
export type PlanCode = "free" | "plus" | "max";
export type BillingInterval = "month" | "year";
export type SubscriptionSubject = { kind: "user"; userId: string } | { kind: "business"; businessId: string };

export interface BillingProvider {
  readonly id: "mock" | "stripe";
  createCheckout(input: {
    subject: SubscriptionSubject;
    plan: Exclude<PlanCode, "free">;
    interval: BillingInterval;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortal(input: { subject: SubscriptionSubject; returnUrl: string }): Promise<{ url: string }>;
}

/** Dev provider: returns to the success URL with a marker. Never grants paid entitlements in production mode. */
export const mockBillingProvider: BillingProvider = {
  id: "mock",
  async createCheckout({ successUrl }) {
    return { url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}mock_checkout=1` };
  },
  async createPortal({ returnUrl }) {
    return { url: returnUrl };
  },
};
